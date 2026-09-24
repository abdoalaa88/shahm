import { useState } from 'react';
import { supabase, Profile, UserRole } from '../lib/supabase';
import { ACTIVE_ROLE_KEY, PENDING_PROFILE_KEY } from '../lib/constants';
import type { AuthMode } from '../lib/appTypes';
import { translateApiError } from '../lib/apiErrors';

interface UseAuthFlowParams {
  sessionUser: { id: string } | null;
  roleSelection: UserRole | null;
  authMode: AuthMode;
  setProfile: (profile: Profile) => void;
  setProfileError: (message: string | null) => void;
  setProfileSetupRequired: (required: boolean) => void;
  setErrorMessage: (message: string | null) => void;
}

/**
 * Sign-in / profile-setup form state and the two handlers that use it.
 * Moved verbatim out of App.tsx; `errorMessage` stays in App and is written
 * through `setErrorMessage`.
 */
export const useAuthFlow = ({
  sessionUser,
  roleSelection,
  authMode,
  setProfile,
  setProfileError,
  setProfileSetupRequired,
  setErrorMessage,
}: UseAuthFlowParams) => {
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  // Patient safety brief — collected once on the requester's profile.
  const [patientAge, setPatientAge] = useState('');
  const [patientCondition, setPatientCondition] = useState('');

  const handleGoogleLogin = async (selectedRole?: UserRole) => {
    setErrorMessage(null);
    const role = selectedRole || roleSelection;
    const isProfileSetup = authMode === 'setup' && !selectedRole;

    if (!role) return;

    if (isProfileSetup && (!firstName.trim() || !/^01\d{9}$/.test(phone.trim()))) {
      setErrorMessage('أدخل الاسم ورقم هاتف مصري صحيح يبدأ بـ 01.');
      return;
    }

    const parsedAge = Number(patientAge);
    if (isProfileSetup && role === 'requester') {
      if (!patientAge.trim() || !Number.isFinite(parsedAge) || parsedAge < 0 || parsedAge > 120) {
        setErrorMessage('أدخل سن المريض بشكل صحيح.');
        return;
      }
      if (!patientCondition.trim() || patientCondition.trim().length < 2) {
        setErrorMessage('اكتب وصف مختصر لحالة المريض الصحية.');
        return;
      }
    }

    const pendingProfile = JSON.stringify({
      ...(isProfileSetup ? { firstName: firstName.trim(), phone: phone.trim() } : {}),
      role,
      ...(isProfileSetup && role === 'requester'
        ? { patientAge: parsedAge, patientCondition: patientCondition.trim() }
        : {}),
    });
    localStorage.setItem(PENDING_PROFILE_KEY, pendingProfile);
    sessionStorage.setItem(PENDING_PROFILE_KEY, pendingProfile);
    setAuthLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error) {
      setAuthLoading(false);
      setErrorMessage(`تعذر تسجيل الدخول عبر Google: ${translateApiError(error.message)}`);
    }
  };

  const handleProfileSetup = async () => {
    const role = roleSelection;
    if (!sessionUser || !role) {
      setErrorMessage('اختار دورك الأول عشان نكمّل إعداد الحساب.');
      return;
    }

    if (!firstName.trim() || !/^01\d{9}$/.test(phone.trim())) {
      setErrorMessage('أدخل الاسم ورقم هاتف مصري صحيح يبدأ بـ 01.');
      return;
    }

    const parsedAge = Number(patientAge);
    if (role === 'requester' && (!patientAge.trim() || !Number.isFinite(parsedAge) || parsedAge < 0 || parsedAge > 120)) {
      setErrorMessage('أدخل سن المريض بشكل صحيح.');
      return;
    }
    if (role === 'requester' && (!patientCondition.trim() || patientCondition.trim().length < 2)) {
      setErrorMessage('اكتب وصف مختصر لحالة المريض الصحية.');
      return;
    }

    setAuthLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        auth_user_id: sessionUser.id,
        first_name: firstName.trim(),
        phone_number: phone.trim(),
        role,
        verification_status: 'unverified',
        ...(role === 'requester'
          ? { patient_age: parsedAge, patient_condition: patientCondition.trim() }
          : {}),
      }, { onConflict: 'auth_user_id,role' })
      .select()
      .single();

    if (error) {
      setAuthLoading(false);
      setProfileError(`تعذر إنشاء ملف الحساب: ${translateApiError(error.message)}`);
      return;
    }

    setProfile(data);
    localStorage.setItem(ACTIVE_ROLE_KEY, data.role);
    sessionStorage.setItem(ACTIVE_ROLE_KEY, data.role);
    setProfileSetupRequired(false);
    setProfileError(null);
    localStorage.removeItem(PENDING_PROFILE_KEY);
    sessionStorage.removeItem(PENDING_PROFILE_KEY);
    setAuthLoading(false);
  };

  return {
    firstName, setFirstName,
    phone, setPhone,
    authLoading, setAuthLoading,
    patientAge, setPatientAge,
    patientCondition, setPatientCondition,
    handleGoogleLogin,
    handleProfileSetup,
  };
};
