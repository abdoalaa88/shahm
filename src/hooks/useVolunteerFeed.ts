import { useRef, useState } from 'react';
import { supabase, NearbyTrip } from '../lib/supabase';
import type { LocationStatus, NearbyAssistanceItem } from '../lib/appTypes';
import { translateApiError } from '../lib/apiErrors';

/**
 * Volunteer location + nearby trips/assistance feed. Moved verbatim out of
 * App.tsx. `volunteerLocationRef` is returned as the ref itself (not a value):
 * the realtime callbacks in the [profile] effect read it so the effect does
 * not have to re-subscribe when the location changes.
 */
export const useVolunteerFeed = () => {
  const [nearbyAssistance, setNearbyAssistance] = useState<NearbyAssistanceItem[]>([]);
  const [pendingTrips, setPendingTrips] = useState<NearbyTrip[]>([]);
  const [volunteerLocation, setVolunteerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [volunteerLocationStatus, setVolunteerLocationStatus] = useState<LocationStatus>('idle');
  const [volunteerLocationError, setVolunteerLocationError] = useState<string | null>(null);

  const volunteerLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const fetchVolunteerNearbyTrips = (lat: number, lng: number) => {
    supabase
      .rpc('get_pending_trips_nearby', { p_lat: lat, p_lng: lng, p_radius_km: 7 })
      .then(({ data, error }) => {
        if (error) {
          setVolunteerLocationError(translateApiError(error.message));
          return;
        }
        if (data) setPendingTrips(data as NearbyTrip[]);
      });
  };

  const fetchNearbyAssistance = (lat: number, lng: number) => {
    supabase.rpc('get_nearby_assistance_requests', { p_lat: lat, p_lng: lng, p_radius_km: 7 })
      .then(({ data, error }) => {
        if (error) setVolunteerLocationError(translateApiError(error.message));
        else setNearbyAssistance((data || []) as typeof nearbyAssistance);
      });
  };

  const requestVolunteerLocation = () => {
    if (!('geolocation' in navigator)) {
      setVolunteerLocationStatus('error');
      setVolunteerLocationError('المتصفح ده مش بيدعم تحديد الموقع.');
      return;
    }
    setVolunteerLocationStatus('loading');
    setVolunteerLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        volunteerLocationRef.current = loc;
        setVolunteerLocation(loc);
        setVolunteerLocationStatus('ready');
        fetchVolunteerNearbyTrips(loc.lat, loc.lng);
        fetchNearbyAssistance(loc.lat, loc.lng);
      },
      (error) => {
        setVolunteerLocationStatus('error');
        setVolunteerLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'محتاجين إذن الوصول لموقعك عشان نطلعلك الطلبات القريبة منك.'
            : 'تعذر تحديد موقعك الحالي، حاول تاني.'
        );
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  return {
    pendingTrips, setPendingTrips,
    nearbyAssistance, setNearbyAssistance,
    volunteerLocation,
    volunteerLocationStatus,
    volunteerLocationError,
    volunteerLocationRef,
    fetchVolunteerNearbyTrips,
    fetchNearbyAssistance,
    requestVolunteerLocation,
  };
};
