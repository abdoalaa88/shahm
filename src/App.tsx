import React, { useState } from 'react';
import { hasSupabaseConfig, supabase, supabaseUrl, UserRole, PublicTrip, ContactCardData, RequesterRelation, NearbyTrip, AssistanceContactData } from './lib/supabase';
import type { AdminTab, AssistanceRole, PlaceSelection } from './lib/appTypes';
import { ACTIVE_ROLE_KEY, PENDING_PROFILE_KEY, TRIP_PUBLIC_COLUMNS } from './lib/constants';
import { translateApiError } from './lib/apiErrors';
import { useInstallPrompt } from './lib/useInstallPrompt';
import { useAuthProfile } from './hooks/useAuthProfile';
import { useAuthFlow } from './hooks/useAuthFlow';
import { useVolunteerFeed } from './hooks/useVolunteerFeed';
import { useAssistance } from './hooks/useAssistance';
import { dismissExpiredTrip } from './lib/dismissedTrips';
import { useRoleSubscriptions } from './hooks/useRoleSubscriptions';
import { notifyTripAccepted, notifyAssistanceAccepted, registerPushNotifications } from './lib/push';
import { ReportModal } from './components/common/ReportModal';
import { SafetyPanel } from './components/admin/SafetyPanel';
import { AnalyticsDashboard } from './components/admin/AnalyticsDashboard';
import { UsageMonitor } from './components/admin/UsageMonitor';
import { UsersPanel } from './components/admin/UsersPanel';
import { InstallNotice } from './components/common/InstallNotice';
import { BottomNav } from './components/common/BottomNav';
import { AppHeader } from './components/common/AppHeader';
import { LoadingScreen } from './screens/LoadingScreen';
import { ProfileErrorScreen } from './screens/ProfileErrorScreen';
import { SuspendedScreen } from './screens/SuspendedScreen';
import { LoginScreen } from './screens/LoginScreen';
import { ProfileSetupScreen } from './screens/ProfileSetupScreen';
import { UnsupportedRoleScreen } from './screens/UnsupportedRoleScreen';
import { VolunteerHome } from './features/volunteer/VolunteerHome';
import { AssistanceRequestTab } from './features/volunteer/AssistanceRequestTab';
import { RequesterHome } from './features/requester/RequesterHome';
import { ADMIN_ROLES, getAdminAccess } from './features/admin/permissions';
import { AdminTabBar } from './features/admin/AdminTabBar';
import { GuidesTab } from './features/shared/GuidesTab';
import { AccountTab, type AccountUpdates } from './features/shared/AccountTab';

export const App: React.FC = () => {
  const { canInstall, showManualInstructions, showInstallPrompt, install } = useInstallPrompt();
  const {
    sessionUser, setSessionUser,
    profile, setProfile,
    roleSelection, setRoleSelection,
    authMode, setAuthMode,
    sessionLoading,
    profileLoading,
    profileError, setProfileError,
    profileSetupRequired, setProfileSetupRequired,
    activeUserId,
  } = useAuthProfile();

  // Admin View State
  const [adminTab, setAdminTab] = useState<AdminTab>('trips');
  const [activeAppTab, setActiveAppTab] = useState<'trips' | 'request' | 'guides' | 'account'>('trips');

  // Auth States
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    firstName, setFirstName,
    phone, setPhone,
    authLoading, setAuthLoading,
    patientAge, setPatientAge,
    patientCondition, setPatientCondition,
    handleGoogleLogin,
    handleProfileSetup,
  } = useAuthFlow({
    sessionUser,
    roleSelection,
    authMode,
    setProfile,
    setProfileError,
    setProfileSetupRequired,
    setErrorMessage,
  });

  // Requester States
  const [origin, setOrigin] = useState<PlaceSelection | null>(null);
  const [dest, setDest] = useState<PlaceSelection | null>(null);
  const [relation, setRelation] = useState<RequesterRelation>('patient');
  const [ackChecked, setAckChecked] = useState(false);
  const [createTripLoading, setCreateTripLoading] = useState(false);
  const [tripActionLoading, setTripActionLoading] = useState(false);
  const [accountUpdateLoading, setAccountUpdateLoading] = useState(false);
  const [activeRequesterTrip, setActiveRequesterTrip] = useState<PublicTrip | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [specialNotes, setSpecialNotes] = useState('');
  const [assistanceType, setAssistanceType] = useState('tire');
  const [assistanceDescription, setAssistanceDescription] = useState('');
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceSuccess, setAssistanceSuccess] = useState(false);
  const [acceptingAssistanceId, setAcceptingAssistanceId] = useState<string | null>(null);
  const [assistanceActionLoading, setAssistanceActionLoading] = useState(false);


  // Volunteer States
  const [activeVolunteerTripData, setActiveVolunteerTripData] = useState<ContactCardData | null>(null);
  const [selectedTripDetails, setSelectedTripDetails] = useState<NearbyTrip | null>(null);
  const [acceptingTripId, setAcceptingTripId] = useState<string | null>(null);
  const [raceConditionDetected, setRaceConditionDetected] = useState(false);

  // Report Modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  const handleInstall = async () => {
    const installed = await install();
    if (installed) {
      const activeRole = (profile?.role
        ?? localStorage.getItem(ACTIVE_ROLE_KEY)
        ?? sessionStorage.getItem(ACTIVE_ROLE_KEY)) as UserRole | null;
      if (activeRole) await registerPushNotifications(activeRole);
      setInstallMessage('تم تثبيت شَهْم وتفعيل التنبيهات المتاحة على جهازك.');
    } else {
      setInstallMessage('لم يتم التثبيت. افتح قائمة المتصفح واختر إضافة إلى الشاشة الرئيسية.');
    }
  };

  const installNotice = showInstallPrompt && !installDismissed ? (
    <InstallNotice
      canInstall={canInstall}
      showManualInstructions={showManualInstructions}
      onInstall={handleInstall}
      onDismiss={() => setInstallDismissed(true)}
      message={installMessage}
    />
  ) : null;

  const configurationNotice = !hasSupabaseConfig ? (
    <div className="fixed top-4 left-4 right-4 z-40 mx-auto max-w-md rounded-xl border border-[#E8A33D]/40 bg-[#FBEFDC] p-3 text-right text-xs text-[#8F5A0A]" role="alert">
      التطبيق يحتاج ضبط مفتاح Supabase العام في إعدادات النشر قبل تسجيل الدخول.
    </div>
  ) : null;

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      activeUserId.current = null;
      supabase.removeAllChannels();
      localStorage.removeItem(PENDING_PROFILE_KEY);
      sessionStorage.removeItem(PENDING_PROFILE_KEY);
      setSessionUser(null);
      setProfile(null);
      setRoleSelection(null);
      setAuthMode('login');
      setFirstName('');
      setPhone('');
      setAuthLoading(false);
      setErrorMessage(null);
      setProfileError(null);
      setProfileSetupRequired(false);
      localStorage.removeItem(ACTIVE_ROLE_KEY);
      sessionStorage.removeItem(ACTIVE_ROLE_KEY);
      setPendingTrips([]);
      setActiveRequesterTrip(null);
      setActiveVolunteerTripData(null);
      setSelectedTripDetails(null);
      setAcceptingTripId(null);
      setRaceConditionDetected(false);
      setReportModalOpen(false);
      setReportSuccess(false);
      setAdminTab('trips');
      setActiveAppTab('trips');
    }
  };

  const {
    pendingTrips, setPendingTrips,
    nearbyAssistance, setNearbyAssistance,
    volunteerLocation,
    volunteerLocationStatus,
    volunteerLocationError,
    volunteerLocationRef,
    fetchVolunteerNearbyTrips,
    fetchNearbyAssistance,
    requestVolunteerLocation,
  } = useVolunteerFeed();
  const {
    myAssistanceRequest, setMyAssistanceRequest,
    activeAssistanceHelp, setActiveAssistanceHelp,
    assistanceExpired, setAssistanceExpired,
    fetchMyAssistanceRequest,
    fetchActiveAssistanceHelp,
  } = useAssistance();

  useRoleSubscriptions({
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
  });

  const handleCreateTrip = async () => {
    if (!origin || !dest || !ackChecked) return;
    setCreateTripLoading(true);
    setErrorMessage(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(`${supabaseUrl}/functions/v1/create-trip-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          origin_area_label: origin.areaLabel,
          origin_address: origin.fullAddress,
          origin_lat: origin.lat,
          origin_lng: origin.lng,
          destination_area_label: dest.areaLabel,
          destination_address: dest.fullAddress,
          destination_lat: dest.lat,
          destination_lng: dest.lng,
          requester_relation: relation,
          scheduled_at: new Date().toISOString(),
          passenger_count: passengerCount,
          special_notes: specialNotes.trim() || null,
        }),
      });

      const responseText = await response.text();
      let resJson: { error?: string; details?: string; trip_id?: string } = {};
      try {
        resJson = JSON.parse(responseText);
      } catch {
        resJson = { error: responseText };
      }
      if (!response.ok) {
        console.error('create-trip-proxy failed', { status: response.status, code: resJson.error, details: resJson.details });
        throw new Error(translateApiError(resJson.details || resJson.error || `فشل إنشاء الطلب (${response.status})`));
      }
      if (!resJson.trip_id) throw new Error('تم استلام الطلب بدون رقم طلب من الخادم');

      const { data, error: tripLoadError } = await supabase
        .from('trips')
        .select(TRIP_PUBLIC_COLUMNS)
        .eq('id', resJson.trip_id)
        .single();

      if (tripLoadError) throw new Error(`تم إنشاء الطلب لكن تعذر تحميله: ${translateApiError(tripLoadError.message)}`);
      if (data) setActiveRequesterTrip(data as unknown as PublicTrip);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setErrorMessage(err instanceof TypeError ? 'تعذر الاتصال بالخادم. حاول مرة أخرى.' : (translateApiError(message) || 'تعذر إرسال طلب الرحلة. حاول مرة أخرى.'));
    } finally {
      setCreateTripLoading(false);
    }
  };

  const handleCreateAssistanceRequest = async () => {
    if (assistanceDescription.trim().length < 5) {
      setErrorMessage('اكتب وصف المشكلة بالتفصيل قبل إرسال طلب العون.');
      return;
    }
    setAssistanceLoading(true);
    setErrorMessage(null);
    setAssistanceSuccess(false);
    setAssistanceExpired(false);
    const location = await new Promise<GeolocationCoordinates | null>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('geolocation-unavailable'));
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position.coords),
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
      );
    }).catch(() => null);
    if (!location) {
      setAssistanceLoading(false);
      setErrorMessage('لازم تسمح بالموقع علشان نقدر نبعث طلب العون للشهم القريب منك.');
      return;
    }
    const { data: assistanceId, error } = await supabase.rpc('create_assistance_request', {
      p_issue_type: assistanceType,
      p_description: assistanceDescription.trim(),
      p_lat: location.latitude,
      p_lng: location.longitude,
    });
    setAssistanceLoading(false);
    if (error) {
      setErrorMessage(translateApiError(error.message));
      return;
    }
    setAssistanceDescription('');
    setAssistanceSuccess(true);
    fetchMyAssistanceRequest();
    if (assistanceId) void supabase.functions.invoke('notify-assistance-request', { body: { assistance_id: assistanceId } });
  };

  const handleAcceptAssistance = async (assistanceId: string) => {
    if (!volunteerLocation) return;
    setAcceptingAssistanceId(assistanceId);
    const { data, error } = await supabase.rpc('accept_assistance_request', {
      p_assistance_id: assistanceId,
      p_lat: volunteerLocation.lat,
      p_lng: volunteerLocation.lng,
    });
    setAcceptingAssistanceId(null);
    if (error) {
      setErrorMessage(translateApiError(error.message));
      return;
    }
    setNearbyAssistance((current) => current.filter((item) => item.id !== assistanceId));
    if (data && data.length > 0) {
      setActiveAssistanceHelp(data[0] as AssistanceContactData);
      void notifyAssistanceAccepted(assistanceId);
    }
  };

  const handleCompleteAssistance = async (assistanceId: string, role: AssistanceRole) => {
    if (assistanceActionLoading) return;
    setAssistanceActionLoading(true);
    const { error } = await supabase.rpc('complete_assistance_request', { p_assistance_id: assistanceId });
    setAssistanceActionLoading(false);
    if (error) {
      setErrorMessage(translateApiError(error.message));
      return;
    }
    if (role === 'helper') setActiveAssistanceHelp(null);
    else setMyAssistanceRequest(null);
  };

  const handleCancelAssistance = async (assistanceId: string) => {
    if (assistanceActionLoading) return;
    setAssistanceActionLoading(true);
    const { error } = await supabase.rpc('cancel_assistance_request', { p_assistance_id: assistanceId });
    setAssistanceActionLoading(false);
    if (error) {
      setErrorMessage(translateApiError(error.message));
      // Most likely it was accepted or expired a moment ago — resync the card.
      fetchMyAssistanceRequest();
      return;
    }
    setAssistanceSuccess(false);
    setMyAssistanceRequest(null);
  };

  const handleAcceptTrip = async (tripId: string) => {
    if (!volunteerLocation) {
      setErrorMessage('محتاجين نعرف موقعك الحالي الأول قبل قبول الرحلة.');
      return;
    }
    setAcceptingTripId(tripId);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc('accept_trip', {
      p_trip_id: tripId,
      p_volunteer_lat: volunteerLocation.lat,
      p_volunteer_lng: volunteerLocation.lng,
    });
    setAcceptingTripId(null);

    if (error) {
      if (error.message.includes('trip is no longer available')) {
        setRaceConditionDetected(true);
      } else {
        setErrorMessage(translateApiError(error.message));
      }
      setSelectedTripDetails(null);
      return;
    }

    if (data && data.length > 0) {
      void notifyTripAccepted(tripId);
      const { data: contact } = await supabase.rpc('reveal_contact', { p_trip_id: tripId });
      setActiveVolunteerTripData(contact?.[0] || data[0]);
      setSelectedTripDetails(null);
      setPendingTrips((prev) => prev.filter((t) => t.id !== tripId));
    }
  };

  const handleCancelTrip = async (tripId: string) => {
    if (tripActionLoading) return;
    setTripActionLoading(true);
    const { error } = await supabase.rpc('cancel_trip', { p_trip_id: tripId });
    if (!error) setActiveRequesterTrip(null);
    else setErrorMessage(translateApiError(error.message));
    setTripActionLoading(false);
  };

  const handleCompleteTrip = async (tripId: string) => {
    if (tripActionLoading) return;
    setTripActionLoading(true);
    const { error } = await supabase.rpc('complete_trip', { p_trip_id: tripId });
    if (!error) {
      setActiveRequesterTrip(null);
      setActiveVolunteerTripData(null);
    } else {
      setErrorMessage(translateApiError(error.message));
    }
    setTripActionLoading(false);
  };

  // A شهم backing out of an accepted trip: the RPC reopens the trip as
  // 'pending' with a fresh window, so realtime refetches put it back in the
  // nearby list and the requester's screen returns to "searching".
  const handleVolunteerCancelTrip = async (tripId: string) => {
    if (tripActionLoading) return;
    setTripActionLoading(true);
    const { error } = await supabase.rpc('volunteer_cancel_trip', { p_trip_id: tripId });
    setTripActionLoading(false);
    if (error) {
      setErrorMessage(translateApiError(error.message));
      return;
    }
    setActiveVolunteerTripData(null);
  };

  // Returns null on success, or a user-facing error message for the form to show inline.
  const handleUpdateProfile = async (updates: AccountUpdates): Promise<string | null> => {
    if (!profile || accountUpdateLoading) return null;
    setAccountUpdateLoading(true);
    const payload: Record<string, unknown> = {
      first_name: updates.firstName.trim(),
      phone_number: updates.phone.trim(),
    };
    if (profile.role === 'requester') {
      payload.patient_age = Number(updates.patientAge);
      payload.patient_condition = updates.patientCondition?.trim();
    }
    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', profile.id)
      .select()
      .single();
    setAccountUpdateLoading(false);
    if (error) return translateApiError(error.message);
    setProfile(data);
    return null;
  };

  if (sessionLoading || (sessionUser && profileLoading)) {
    return <LoadingScreen />;
  }

  if (sessionUser && profileError && !profileSetupRequired) {
    return <ProfileErrorScreen message={profileError} onSignOut={handleSignOut} />;
  }

  if (profile && !profile.is_active) {
    return <SuspendedScreen onSignOut={handleSignOut} />;
  }

  if (!sessionUser && !roleSelection && authMode === 'login') {
    return (
      <LoginScreen
        configurationNotice={configurationNotice}
        installNotice={installNotice}
        authLoading={authLoading}
        onLogin={handleGoogleLogin}
      />
    );
  }

  if (!sessionUser || profileSetupRequired) {
    return (
      <ProfileSetupScreen
        configurationNotice={configurationNotice}
        installNotice={installNotice}
        errorMessage={errorMessage}
        profileSetupRequired={profileSetupRequired}
        roleSelection={roleSelection}
        firstName={firstName}
        phone={phone}
        patientAge={patientAge}
        patientCondition={patientCondition}
        authLoading={authLoading}
        onSelectRole={setRoleSelection}
        onFirstNameChange={setFirstName}
        onPhoneChange={setPhone}
        onPatientAgeChange={setPatientAge}
        onPatientConditionChange={setPatientCondition}
        onSignOut={handleSignOut}
        onBackToLogin={() => { setRoleSelection(null); setAuthMode('login'); }}
        onGoogleLogin={handleGoogleLogin}
        onProfileSetup={handleProfileSetup}
      />
    );
  }

  const {
    isAdmin,
    canViewTrips,
    canViewSafety,
    canViewAnalytics,
    canViewUsage,
    canManageUsers,
    effectiveAdminTab,
  } = getAdminAccess(profile?.role, adminTab);
  const showRequesterView = profile?.role === 'requester';

  const showVolunteerView = profile?.role === 'volunteer' || (canViewTrips && effectiveAdminTab === 'trips');

  if (sessionUser && !['requester', 'volunteer', ...ADMIN_ROLES].includes(profile?.role)) {
    return <UnsupportedRoleScreen onSignOut={handleSignOut} />;
  }

  return (
    <div className="stitch-page flex flex-col text-right">
      {configurationNotice}
      {installNotice}

      <AppHeader
        firstName={profile?.first_name}
        role={profile?.role}
        canInstall={canInstall}
        onInstall={install}
        onSignOut={handleSignOut}
        showSignOut={Boolean(isAdmin)}
      >
        {isAdmin && (
          <AdminTabBar
            effectiveAdminTab={effectiveAdminTab}
            canViewTrips={canViewTrips}
            canViewSafety={canViewSafety}
            canViewAnalytics={canViewAnalytics}
            canViewUsage={canViewUsage}
            canManageUsers={canManageUsers}
            onSelectTab={setAdminTab}
          />
        )}
      </AppHeader>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-4 pb-28">
        {canViewSafety && effectiveAdminTab === 'safety' && <SafetyPanel />}
        {canViewAnalytics && effectiveAdminTab === 'analytics' && <AnalyticsDashboard />}
        {canViewUsage && effectiveAdminTab === 'usage' && <UsageMonitor />}
        {canManageUsers && effectiveAdminTab === 'users' && <UsersPanel />}

        {showRequesterView && activeAppTab !== 'guides' && activeAppTab !== 'account' && (
          <RequesterHome
            reportSuccess={reportSuccess}
            activeRequesterTrip={activeRequesterTrip}
            tripActionLoading={tripActionLoading}
            onCancelTrip={handleCancelTrip}
            onStartNewRequest={() => {
              if (activeRequesterTrip?.status === 'expired') dismissExpiredTrip(activeRequesterTrip.id);
              setActiveRequesterTrip(null);
            }}
            onCompleteTrip={handleCompleteTrip}
            onReport={() => setReportModalOpen(true)}
            errorMessage={errorMessage}
            relation={relation}
            passengerCount={passengerCount}
            specialNotes={specialNotes}
            ackChecked={ackChecked}
            createTripLoading={createTripLoading}
            hasOrigin={Boolean(origin)}
            hasDestination={Boolean(dest)}
            onOriginSelect={setOrigin}
            onDestinationSelect={setDest}
            onRelationChange={setRelation}
            onPassengerCountChange={setPassengerCount}
            onSpecialNotesChange={setSpecialNotes}
            onAckCheckedChange={setAckChecked}
            onCreateTrip={handleCreateTrip}
          />
        )}

        {profile?.role === 'volunteer' && activeAppTab === 'request' && (
          <AssistanceRequestTab
            myAssistanceRequest={myAssistanceRequest}
            assistanceActionLoading={assistanceActionLoading}
            assistanceSuccess={assistanceSuccess}
            assistanceType={assistanceType}
            assistanceDescription={assistanceDescription}
            assistanceLoading={assistanceLoading}
            assistanceExpired={assistanceExpired}
            onCompleteAssistance={handleCompleteAssistance}
            onCancelAssistance={handleCancelAssistance}
            onAssistanceTypeChange={setAssistanceType}
            onAssistanceDescriptionChange={setAssistanceDescription}
            onCreateAssistanceRequest={handleCreateAssistanceRequest}
          />
        )}

        {showVolunteerView && activeAppTab === 'trips' && (
          <VolunteerHome
            role={profile?.role}
            raceConditionDetected={raceConditionDetected}
            onDismissRaceCondition={() => setRaceConditionDetected(false)}
            activeAssistanceHelp={activeAssistanceHelp}
            assistanceActionLoading={assistanceActionLoading}
            onCompleteAssistance={handleCompleteAssistance}
            activeVolunteerTripData={activeVolunteerTripData}
            tripActionLoading={tripActionLoading}
            onCompleteTrip={handleCompleteTrip}
            onCancelTrip={handleVolunteerCancelTrip}
            onReport={() => setReportModalOpen(true)}
            volunteerLocationStatus={volunteerLocationStatus}
            volunteerLocationError={volunteerLocationError}
            onRequestLocation={requestVolunteerLocation}
            nearbyAssistance={nearbyAssistance}
            acceptingAssistanceId={acceptingAssistanceId}
            onAcceptAssistance={handleAcceptAssistance}
            pendingTrips={pendingTrips}
            onSelectTrip={setSelectedTripDetails}
            selectedTripDetails={selectedTripDetails}
            acceptingTripId={acceptingTripId}
            onAcceptTrip={handleAcceptTrip}
            onCloseTripDetails={() => setSelectedTripDetails(null)}
          />
        )}

        {activeAppTab === 'guides' && <GuidesTab />}

        {activeAppTab === 'account' && (
          <AccountTab
            profile={profile}
            onSignOut={handleSignOut}
            onUpdateProfile={handleUpdateProfile}
            accountUpdateLoading={accountUpdateLoading}
          />
        )}

        {!isAdmin && activeAppTab !== 'account' && (
          <button type="button" onClick={handleSignOut} className="w-full rounded-full bg-[#dbece0] py-3 text-center text-sm font-semibold text-[#005131] transition-colors hover:bg-[#cdded2]">
            تسجيل الخروج
          </button>
        )}

        <ReportModal
          tripId={activeVolunteerTripData?.trip_id || activeRequesterTrip?.id}
          reportedProfileId={activeVolunteerTripData?.requester_id}
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          onSuccess={() => setReportSuccess(true)}
        />
      </main>
      {!isAdmin && <BottomNav active={activeAppTab} onChange={setActiveAppTab} showRequest={profile?.role === 'volunteer'} />}
    </div>
  );
};

export default App;
