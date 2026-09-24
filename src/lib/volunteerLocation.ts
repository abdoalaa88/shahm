import { supabase } from './supabase';

/**
 * يبلّغ السيرفر بآخر موقع للمتطوع، عشان إشعارات "طلب جديد قريب منك"
 * تروح للمتطوعين الأقرب بس (في حدود 20 كم). الموقع مش بيتقرأ من المتصفح
 * أبدًا — بيتكتب بس عن طريق update_volunteer_location.
 */

const MIN_INTERVAL_MS = 60_000;
const MIN_MOVE_KM = 0.5;

let lastReport: { lat: number; lng: number; at: number } | null = null;

const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cosine =
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLng) - toRad(aLng)) +
    Math.sin(toRad(aLat)) * Math.sin(toRad(bLat));

  return 6371 * Math.acos(Math.min(1, Math.max(-1, cosine)));
};

export async function reportVolunteerLocation(lat: number, lng: number): Promise<void> {
  const now = Date.now();

  // نتجنب الإرسال المتكرر: مرة كل دقيقة، إلا لو اتحرك المتطوع أكتر من 500 متر.
  if (
    lastReport &&
    now - lastReport.at < MIN_INTERVAL_MS &&
    distanceKm(lat, lng, lastReport.lat, lastReport.lng) < MIN_MOVE_KM
  ) {
    return;
  }

  lastReport = { lat, lng, at: now };

  const { error } = await supabase.rpc('update_volunteer_location', {
    p_lat: lat,
    p_lng: lng,
  });

  if (error) {
    lastReport = null;
    console.error('update_volunteer_location failed', error.message);
  }
}
