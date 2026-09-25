import { supabase } from './supabase';

/**
 * يبلّغ السيرفر بآخر موقع للمتطوع، عشان إشعارات "طلب جديد قريب منك"
 * تروح للمتطوعين الأقرب فقط. الموقع مش بيتقرأ من المتصفح
 * أبدًا — بيتكتب بس عن طريق update_volunteer_location.
 */

const MIN_INTERVAL_MS = 60_000;
const MIN_MOVE_KM = 0.5;

let lastReport: { lat: number; lng: number; at: number } | null = null;
let pendingReport: { lat: number; lng: number } | null = null;
let reportInProgress = false;

const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cosine =
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLng) - toRad(aLng)) +
    Math.sin(toRad(aLat)) * Math.sin(toRad(bLat));

  return 6371 * Math.acos(Math.min(1, Math.max(-1, cosine)));
};

export async function reportVolunteerLocation(lat: number, lng: number): Promise<void> {
  pendingReport = { lat, lng };
  if (reportInProgress) return;
  reportInProgress = true;

  try {
    while (pendingReport) {
      const next = pendingReport;
      pendingReport = null;
      const now = Date.now();

      // Report at most once per minute unless the volunteer moved over 500m.
      if (
        lastReport &&
        now - lastReport.at < MIN_INTERVAL_MS &&
        distanceKm(next.lat, next.lng, lastReport.lat, lastReport.lng) < MIN_MOVE_KM
      ) continue;

      const { error } = await supabase
        .rpc('update_volunteer_location', {
          p_lat: next.lat,
          p_lng: next.lng,
        })
        .abortSignal(AbortSignal.timeout(12000));

      if (error) {
        console.error('update_volunteer_location failed', error.message);
        break;
      }

      lastReport = { ...next, at: Date.now() };
    }
  } catch (error) {
    console.error('update_volunteer_location failed', error);
  } finally {
    reportInProgress = false;
    // A location may arrive between the final loop check and releasing the lock.
    if (pendingReport) void reportVolunteerLocation(pendingReport.lat, pendingReport.lng);
  }
}
