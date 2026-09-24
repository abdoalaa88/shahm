import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supabase, ContactCardData, NearbyTrip, Profile, PublicTrip } from '../lib/supabase';
import { TRIP_PUBLIC_COLUMNS } from '../lib/constants';
import { isExpiredTripDismissed } from '../lib/dismissedTrips';
import { translateApiError } from '../lib/apiErrors';

interface UseRoleSubscriptionsParams {
  profile: Profile | null;
  selectedTripDetails: NearbyTrip | null;
  volunteerLocationRef: { current: { lat: number; lng: number } | null };
  fetchVolunteerNearbyTrips: (lat: number, lng: number) => void;
  fetchNearbyAssistance: (lat: number, lng: number) => void;
  fetchMyAssistanceRequest: () => void;
  fetchActiveAssistanceHelp: () => void;
  requestVolunteerLocation: () => void;
  setErrorMessage: (message: string | null) => void;
  setActiveRequesterTrip: (trip: PublicTrip | null) => void;
  setActiveVolunteerTripData: (data: ContactCardData | null) => void;
  setPendingTrips: Dispatch<SetStateAction<NearbyTrip[]>>;
  setSelectedTripDetails: (trip: NearbyTrip | null) => void;
}

/**
 * The single per-role data/realtime effect (requester, volunteer, admin),
 * moved verbatim out of App.tsx. It must stay ONE effect with deps [profile]
 * and must be called after useAuthProfile, exactly where it used to sit.
 *
 * Every value it uses comes from the render in which `profile` changed, as
 * before. In particular `selectedTripDetails` is captured stale on purpose
 * (known issue, intentionally not changed by this refactor).
 */
export const useRoleSubscriptions = ({
  profile,
  selectedTripDetails,
  volunteerLocationRef,
  fetchVolunteerNearbyTrips,
  fetchNearbyAssistance,
  fetchMyAssistanceRequest,
  fetchActiveAssistanceHelp,
  requestVolunteerLocation,
  setErrorMessage,
  setActiveRequesterTrip,
  setActiveVolunteerTripData,
  setPendingTrips,
  setSelectedTripDetails,
}: UseRoleSubscriptionsParams) => {
  useEffect(() => {
    if (!profile) return;

    if (profile.role === 'requester') {
      // A pending request's 15-minute window (expires_at) can pass without
      // any other user touching the row, so nothing would ever trigger a
      // postgres_changes event for it. expire_stale_trips() sweeps such
      // requests to 'expired' opportunistically; calling it here (and on
      // the interval below) means this screen converges on the truth even
      // if the requester is just sitting on the pending screen.
      const fetchActiveRequesterTrip = () => {
        supabase.rpc('expire_stale_trips').then(() => {
          supabase
            .from('trips')
            .select(TRIP_PUBLIC_COLUMNS)
            .in('status', ['pending', 'accepted', 'expired'])
            .order('created_at', { ascending: false })
            .limit(1)
            .then(({ data, error }) => {
              if (error) {
                setErrorMessage(`تعذر تحميل الرحلة الحالية: ${translateApiError(error.message)}`);
                return;
              }
              const latest = (data?.[0] as unknown as PublicTrip | undefined) || null;
              // An expired trip the requester already dismissed must not come
              // back on the next poll/realtime refetch.
              if (latest?.status === 'expired' && isExpiredTripDismissed(latest.id)) {
                setActiveRequesterTrip(null);
                return;
              }
              setActiveRequesterTrip(latest);
            });
        });
      };

      fetchActiveRequesterTrip();

      const channel = supabase
        .channel(`requester-trips-${profile.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
          fetchActiveRequesterTrip();
        })
        .subscribe();

      // Backstop poll: catches a pending request that has quietly passed
      // its expires_at with no other user around to trigger a table event.
      const expiryPoll = setInterval(fetchActiveRequesterTrip, 20000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(expiryPoll);
      };
    }

    if (profile.role === 'volunteer') {
      requestVolunteerLocation();
      fetchMyAssistanceRequest();
      fetchActiveAssistanceHelp();

      supabase
        .from('trips')
        .select('id')
        .eq('volunteer_id', profile.id)
        .eq('status', 'accepted')
        .maybeSingle()
        .then(async ({ data, error }) => {
          if (error) {
            setErrorMessage(`تعذر تحميل الرحلة المقبولة: ${translateApiError(error.message)}`);
            return;
          }
          if (data) {
            const { data: contact, error: contactError } = await supabase.rpc('reveal_contact', { p_trip_id: data.id });
            if (contactError) {
              setErrorMessage(`تعذر تحميل بيانات التواصل: ${translateApiError(contactError.message)}`);
              return;
            }
            if (contact && contact.length > 0) setActiveVolunteerTripData(contact[0]);
          }
        });

      // The RPC already filters by distance and enriches with schedule and
      // patient info, so any change on the table just triggers a re-fetch
      // (reading the volunteer's last known location from a ref, since this
      // effect only runs once per profile and shouldn't re-subscribe every
      // time the location updates) rather than patching a raw payload that
      // lacks those fields.
      const channel = supabase
        .channel('trips-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
          const loc = volunteerLocationRef.current;
          if (loc) fetchVolunteerNearbyTrips(loc.lat, loc.lng);
          supabase.from('trips').select('id').eq('volunteer_id', profile.id).eq('status', 'accepted').maybeSingle().then(async ({ data }) => {
            if (!data) {
              setActiveVolunteerTripData(null);
              return;
            }
            const { data: contact } = await supabase.rpc('reveal_contact', { p_trip_id: data.id });
            setActiveVolunteerTripData(contact?.[0] || null);
          });
        })
        .subscribe();
      // NOTE: assistance_requests is deliberately NOT in the supabase_realtime
      // publication and authenticated has no select on it (access is RPC-only),
      // so this subscription will normally never fire. The polling below is the
      // mechanism that actually keeps the assistance screens fresh; the channel
      // is kept only so it starts working if the publication is ever extended.
      const assistanceChannel = supabase
        .channel('assistance-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assistance_requests' }, () => {
          const loc = volunteerLocationRef.current;
          if (loc) fetchNearbyAssistance(loc.lat, loc.lng);
          fetchMyAssistanceRequest();
          fetchActiveAssistanceHelp();
        })
        .subscribe();

      const refreshAssistance = () => {
        fetchMyAssistanceRequest();
        fetchActiveAssistanceHelp();
        const loc = volunteerLocationRef.current;
        if (loc) fetchNearbyAssistance(loc.lat, loc.lng);
      };
      const assistancePoll = setInterval(() => {
        if (!document.hidden) refreshAssistance();
      }, 15000);
      const onVisibilityChange = () => {
        if (!document.hidden) refreshAssistance();
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(assistanceChannel);
        clearInterval(assistancePoll);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }

    if (typeof profile.role === 'string' && profile.role.includes('admin')) {
      // Admin oversight is not bound by the volunteer 7km radius — it shows
      // every pending trip, without distance or the patient safety brief.
      supabase
        .from('trips')
        .select(TRIP_PUBLIC_COLUMNS)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) setErrorMessage(`تعذر تحميل طلبات الإدارة: ${translateApiError(error.message)}`);
          if (data) setPendingTrips(data as unknown as NearbyTrip[]);
        });

      const channel = supabase
        .channel('trips-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            const newTrip = payload.new as NearbyTrip;
            if (newTrip.status === 'pending') setPendingTrips((prev) => [newTrip, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as NearbyTrip;
            const targetId = updated?.id || payload.old?.id;
            if (!updated || updated.status !== 'pending') {
              if (targetId) {
                setPendingTrips((prev) => prev.filter((t) => t.id !== targetId));
                if (selectedTripDetails?.id === targetId) setSelectedTripDetails(null);
              }
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (deletedId) setPendingTrips((prev) => prev.filter((t) => t.id !== deletedId));
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile]);
};
