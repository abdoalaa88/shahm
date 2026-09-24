import { useEffect, useRef, useState } from 'react';
import { supabase, UserRole } from '../lib/supabase';
import { ACTIVE_ROLE_KEY, PENDING_PROFILE_KEY } from '../lib/constants';
import type { AuthMode } from '../lib/appTypes';
import { translateApiError } from '../lib/apiErrors';

/**
 * Session + profile loading state. Moved verbatim out of App.tsx.
 *
 * The auth effect (deps []) closes over the `fetchProfile` of the first
 * render, exactly as it did inside App. It only touches the state below and
 * the two refs, never App's `errorMessage`.
 */
export const useAuthProfile = () => {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSetupRequired, setProfileSetupRequired] = useState(false);
  const activeUserId = useRef<string | null>(null);
  const profileRequestId = useRef(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) setProfileError(`تعذر استعادة جلسة الدخول: ${translateApiError(error.message)}`);
      setSessionUser(session?.user ?? null);
      activeUserId.current = session?.user.id ?? null;
      if (session?.user) fetchProfile(session.user.id);
      else setSessionLoading(false);
    }).catch((error: unknown) => {
      setProfileError(error instanceof Error ? translateApiError(error.message) : 'تعذر استعادة جلسة الدخول');
      setSessionLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
      activeUserId.current = session?.user.id ?? null;
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
      }
      setSessionLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);


  const fetchProfile = async (uid: string) => {
    const requestId = ++profileRequestId.current;
    setProfileLoading(true);
    setProfileError(null);
    setProfileSetupRequired(false);
    try {
      let pendingProfile: {
        firstName?: string;
        phone?: string;
        role?: UserRole;
        patientAge?: number;
        patientCondition?: string;
      } | null = null;
      try {
        const storedPendingProfile = localStorage.getItem(PENDING_PROFILE_KEY) || sessionStorage.getItem(PENDING_PROFILE_KEY);
        pendingProfile = JSON.parse(storedPendingProfile || 'null');
      } catch {
        localStorage.removeItem(PENDING_PROFILE_KEY);
        sessionStorage.removeItem(PENDING_PROFILE_KEY);
      }

      const storedRole = (localStorage.getItem(ACTIVE_ROLE_KEY) || sessionStorage.getItem(ACTIVE_ROLE_KEY)) as UserRole | null;
      const preferredRole = pendingProfile?.role || storedRole;
      let profileQuery = supabase.from('profiles').select('*').eq('auth_user_id', uid);
      if (preferredRole) profileQuery = profileQuery.eq('role', preferredRole);
      const { data: profiles, error } = await profileQuery;
      if (error) throw error;
      if (activeUserId.current !== uid || profileRequestId.current !== requestId) return;
      const data = profiles?.length === 1 ? profiles[0] : null;
      if (!data) {
        if (pendingProfile?.firstName && pendingProfile?.phone && pendingProfile?.role) {
          const { data: createdProfile, error: createError } = await supabase
            .from('profiles')
            .upsert({
              auth_user_id: uid,
              first_name: pendingProfile.firstName,
              phone_number: pendingProfile.phone,
              role: pendingProfile.role,
              verification_status: 'unverified',
              ...(pendingProfile.role === 'requester'
                ? { patient_age: pendingProfile.patientAge, patient_condition: pendingProfile.patientCondition }
                : {}),
            }, { onConflict: 'auth_user_id,role' })
            .select()
            .single();
          if (createError) throw createError;
          if (activeUserId.current !== uid || profileRequestId.current !== requestId) return;
          setProfile(createdProfile);
          localStorage.setItem(ACTIVE_ROLE_KEY, createdProfile.role);
          sessionStorage.setItem(ACTIVE_ROLE_KEY, createdProfile.role);
          localStorage.removeItem(PENDING_PROFILE_KEY);
          sessionStorage.removeItem(PENDING_PROFILE_KEY);
          setProfileSetupRequired(false);
        } else if ((profiles?.length ?? 0) > 1) {
          setProfile(null);
          setRoleSelection(null);
          setAuthMode('setup');
          setProfileSetupRequired(true);
          setProfileError('اختار دور الحساب لاستكمال الدخول.');
        } else {
          setProfile(null);
          setRoleSelection(pendingProfile?.role || null);
          setAuthMode('setup');
          setProfileSetupRequired(true);
        }
      } else {
        setProfile(data);
        localStorage.setItem(ACTIVE_ROLE_KEY, data.role);
        sessionStorage.setItem(ACTIVE_ROLE_KEY, data.role);
        setProfileSetupRequired(false);
      }
    } catch (error: unknown) {
      if (activeUserId.current === uid && profileRequestId.current === requestId) {
        setProfile(null);
        setProfileError(error instanceof Error ? translateApiError(error.message) : 'تعذر تحميل بيانات المستخدم');
      }
    } finally {
      if (profileRequestId.current === requestId) {
        setProfileLoading(false);
        setSessionLoading(false);
      }
    }
  };

  return {
    sessionUser, setSessionUser,
    profile, setProfile,
    roleSelection, setRoleSelection,
    authMode, setAuthMode,
    sessionLoading,
    profileLoading,
    profileError, setProfileError,
    profileSetupRequired, setProfileSetupRequired,
    activeUserId,
  };
};
