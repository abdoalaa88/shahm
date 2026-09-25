import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import {
  hasSupabaseConfig,
  supabase,
  supabaseUrl,
  UserRole,
  PublicTrip,
  VolunteerContactData,
  PatientProfile,
  MedicalTripNearby,
  MedicalTripContact,
  CaptainAssistanceRequest,
  NearbyCaptainAssistance,
  AcceptedCaptainAssistance,
  RatingSummary,
  TripToRate,
} from './lib/supabase';
import { reportVolunteerLocation } from './lib/volunteerLocation';
import { LocationPicker } from './components/common/LocationPicker';
import { ReportModal } from './components/common/ReportModal';
import { RatingStars } from './components/common/RatingStars';
import { RaceConditionToast } from './components/common/StateViews';
const SafetyPanel = lazy(() => import('./components/admin/SafetyPanel').then((module) => ({ default: module.SafetyPanel })));
const AnalyticsDashboard = lazy(() => import('./components/admin/AnalyticsDashboard').then((module) => ({ default: module.AnalyticsDashboard })));
const UsageMonitor = lazy(() => import('./components/admin/UsageMonitor').then((module) => ({ default: module.UsageMonitor })));
import { toWhatsAppNumber } from './lib/phone';
import { useInstallPrompt } from './lib/useInstallPrompt';
import { registerPushNotifications } from './lib/push';
import {
  formatDistance,
  formatTimeSince,
  hasCompleteVolunteerVehicleDetails,
  installDismissedStorageKey,
  readBooleanPreference,
  ROAD_PROBLEM_TYPES,
  writeBooleanPreference,
} from './lib/app-helpers';
import {
  HeartHandshake,
  Phone,
  MessageSquare,
  Map,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  MapPin,
  X,
  ShieldCheck,
  Ban,
  AlertTriangle,
  LayoutDashboard,
  ShieldAlert,
  Server,
  Download,
  LocateFixed,
  ArrowRight,
  BellRing,
  UserRound,
  BookOpen,
  CarFront,
  Pencil,
  Star,
} from 'lucide-react';

type InstallNoticeProps = {
  canInstall: boolean;
  showManualInstructions: boolean;
  onInstall: () => Promise<void>;
  onDismiss: () => void;
  message: string | null;
};

const InstallNotice: React.FC<InstallNoticeProps> = ({
  canInstall,
  showManualInstructions,
  onInstall,
  onDismiss,
  message,
}) => (
  <div
    className="fixed inset-0 z-[100] grid h-[100dvh] w-screen place-items-center overflow-y-auto bg-[#10251b]/60 p-4 backdrop-blur-md"
    onClick={(event) => { if (event.target === event.currentTarget) onDismiss(); }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="install-notice-title"
  >
    <section className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col items-center overflow-y-auto rounded-3xl border border-[#146B44]/15 bg-white p-6 text-center shadow-2xl shadow-[#10251b]/25">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="إغلاق نافذة التثبيت"
        className="absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E6F4ED] text-[#146B44]">
        <Download className="h-8 w-8" aria-hidden="true" />
      </div>

      <h2 id="install-notice-title" className="mb-2 text-xl font-bold text-[#1F2430]">
        تثبيت تطبيق شَهْم
      </h2>

      {showManualInstructions ? (
        <div className="mb-4 w-full rounded-xl border border-gray-100 bg-[#F7F8F9] p-3 text-right text-sm leading-6 text-[#53645a]">
          <p className="mb-1 font-semibold text-[#1F2430]">خطوات التثبيت على جهازك:</p>
          <ol className="list-decimal space-y-1 pr-5">
            <li>اضغط زر مشاركة (Share) من المتصفح.</li>
            <li>اختر «إضافة إلى الشاشة الرئيسية».</li>
            <li>افتح شَهْم من الأيقونة مباشرة.</li>
          </ol>
        </div>
      ) : (
        <p className="mb-6 text-sm leading-6 text-[#6B7280]">
          ثبّت شَهْم على شاشة هاتفك للوصول السريع واستقبال التنبيهات.
        </p>
      )}

      {message && (
        <p className="mb-4 w-full rounded-xl border border-[#146B44]/20 bg-[#E6F4ED] p-3 text-sm font-semibold text-[#146B44]">
          {message}
        </p>
      )}

      <div className="flex w-full flex-col gap-2">
        {!message && canInstall && (
          <button
            type="button"
            onClick={onInstall}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#146B44] text-sm font-bold text-white shadow-md transition-colors active:bg-[#0F5636]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            تثبيت التطبيق الآن
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 w-full rounded-xl py-2 text-sm font-medium text-[#6B7280] transition-colors hover:bg-[#F7F8F9] hover:text-[#1F2430]"
        >
          المتابعة عبر المتصفح
        </button>
      </div>
    </section>
  </div>
);

const normalizeDigits = (value: string) => value
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

interface TripRatingPromptProps {
  trip: TripToRate;
  role: UserRole;
  selectedStars: number;
  onSelect: (stars: number) => void;
  selectedWord: string;
  onSelectWord: (word: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

const DEFAULT_RATING_SUMMARY: RatingSummary = { average_rating: 5, rating_count: 0, positive_percentage: null };
const PATIENT_RATING_WORDS = ['محترم', 'متعاون', 'ملتزم', 'سريع', 'مطمئن'];
const VOLUNTEER_RATING_WORDS = ['متعاون', 'ملتزم', 'محترم', 'واضح', 'مُقدِّر'];

const TripRatingPrompt: React.FC<TripRatingPromptProps> = ({ trip, role, selectedStars, onSelect, selectedWord, onSelectWord, onSubmit, loading }) => {
  const words = role === 'requester' ? PATIENT_RATING_WORDS : VOLUNTEER_RATING_WORDS;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#10251b]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="trip-rating-title" dir="rtl">
      <section className="w-full max-w-sm space-y-4 rounded-3xl border border-[#146B44]/10 bg-white p-5 text-center shadow-2xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#E6F4ED] text-[#146B44]"><Star className="h-7 w-7 fill-current" /></div>
        <div>
          <h2 id="trip-rating-title" className="text-lg font-bold text-[#1F2430]">انتهت الرحلة بنجاح</h2>
          <p className="mt-1 text-sm text-[#53645a]">قيّم {trip.other_first_name}</p>
          <p className="mt-1 text-xs text-[#6B7280]">التقييم اللفظي داخلي ولن يظهر للمستخدم الآخر</p>
        </div>
        <div className="flex justify-center gap-2" role="group" aria-label="اختر عدد النجوم">
          {[1, 2, 3, 4, 5].map((stars) => (
            <button key={stars} type="button" onClick={() => onSelect(stars)} aria-label={`${stars} نجوم`} aria-pressed={selectedStars === stars} className="grid h-11 w-11 place-items-center rounded-full bg-[#FFFCF2] text-[#C88700] shadow-sm ring-1 ring-[#E4D49A]">
              <Star className={'h-6 w-6 ' + (stars <= selectedStars ? 'fill-current' : 'fill-transparent')} />
            </button>
          ))}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-[#1F2430]">اختر وصفًا بكلمة واحدة</p>
          <div className="flex flex-wrap justify-center gap-2">
            {words.map((word) => (
              <button key={word} type="button" onClick={() => onSelectWord(word)} aria-pressed={selectedWord === word} className={'min-h-10 rounded-full border px-3 text-sm font-semibold transition-colors ' + (selectedWord === word ? 'border-[#146B44] bg-[#E6F4ED] text-[#146B44]' : 'border-[#8A949E]/25 bg-white text-[#53645a]')}>
                {word}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onSubmit} disabled={loading || !selectedWord} className="min-h-11 w-full rounded-xl bg-[#146B44] text-sm font-bold text-white disabled:opacity-60">
          {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'إرسال التقييم'}
        </button>
      </section>
    </div>
  );
};

const hasMeaningfulLetters = (value: string, minimum = 2) => {
  const letters = value.match(/[\p{L}\p{M}]/gu) ?? [];
  const compact = letters.join('').toLocaleLowerCase();
  return letters.length >= minimum && !/^(.)\1+$/u.test(compact);
};

export const App: React.FC = () => {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(true);
  const isOnlineRef = useRef(true);
  const [presenceCounts, setPresenceCounts] = useState<{ shahm: number | null; patient: number | null }>({ shahm: null, patient: null });
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(null);
  const [addingRequesterProfile, setAddingRequesterProfile] = useState(false);
  const [canReturnToVolunteer, setCanReturnToVolunteer] = useState(false);

  const [adminTab, setAdminTab] = useState<
    'trips' | 'safety' | 'analytics' | 'usage'
  >('trips');

  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');

  const [vehicleType, setVehicleType] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');
  const [vehicleDetailsConfirmed, setVehicleDetailsConfirmed] = useState(false);
  const [vehicleProfileSaving, setVehicleProfileSaving] = useState(false);
  const [vehicleProfileError, setVehicleProfileError] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const activeUserId = useRef<string | null>(null);

  const [origin, setOrigin] = useState<{
    areaLabel: string;
    fullAddress: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [destination, setDestination] = useState<{
    areaLabel: string;
    fullAddress: string;
    lat: number;
    lng: number;
  } | null>(null);

  const [patientProfiles, setPatientProfiles] = useState<PatientProfile[]>([]);
  const [selectedPatientProfileId, setSelectedPatientProfileId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAgeInput, setPatientAgeInput] = useState('');
  const [patientConditionInput, setPatientConditionInput] = useState('');
  const [showPatientProfileForm, setShowPatientProfileForm] = useState(false);
  const [editingPatientProfileId, setEditingPatientProfileId] = useState<string | null>(null);
  const [savingPatientProfile, setSavingPatientProfile] = useState(false);
  const [peopleCount, setPeopleCount] = useState('1');
  const [requesterRelation, setRequesterRelation] = useState<'patient' | 'guardian' | 'companion'>('patient');

  const [showAssistanceForm, setShowAssistanceForm] = useState(false);
  const [assistanceLocation, setAssistanceLocation] = useState<{
    areaLabel: string;
    fullAddress: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [assistanceIssueType, setAssistanceIssueType] = useState('');
  const [assistanceNotes, setAssistanceNotes] = useState('');
  const [activeAssistanceRequest, setActiveAssistanceRequest] = useState<CaptainAssistanceRequest | null>(null);
  const [nearbyAssistanceRequests, setNearbyAssistanceRequests] = useState<NearbyCaptainAssistance[]>([]);
  const [activeAcceptedAssistance, setActiveAcceptedAssistance] = useState<AcceptedCaptainAssistance | null>(null);
  const [creatingAssistanceRequest, setCreatingAssistanceRequest] = useState(false);

  const [requestNotes, setRequestNotes] = useState('');
  const [ackChecked, setAckChecked] = useState(false);
  const [createTripLoading, setCreateTripLoading] = useState(false);

  const [activeRequesterTrip, setActiveRequesterTrip] =
    useState<PublicTrip | null>(null);

  const [pendingTrips, setPendingTrips] = useState<PublicTrip[]>([]);

  const [activeVolunteerTripData, setActiveVolunteerTripData] =
    useState<MedicalTripContact | null>(null);
  const [profileRating, setProfileRating] = useState<RatingSummary | null>(null);
  const [ratingSummaries, setRatingSummaries] = useState<Record<string, RatingSummary>>({});
  const [tripToRate, setTripToRate] = useState<TripToRate | null>(null);
  const [selectedTripStars, setSelectedTripStars] = useState(5);
  const [selectedTripRatingWord, setSelectedTripRatingWord] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const currentRatingTripId = useRef<string | null>(null);
  const [cancelTripId, setCancelTripId] = useState<string | null>(null);
  const [cancelTripReason, setCancelTripReason] = useState('');
  const [cancelTripDetails, setCancelTripDetails] = useState('');
  const [cancelTripSubmitting, setCancelTripSubmitting] = useState(false);
  const [cancelTripError, setCancelTripError] = useState<string | null>(null);

  const [selectedTripDetails, setSelectedTripDetails] =
    useState<PublicTrip | null>(null);
  const [selectedTripAddresses, setSelectedTripAddresses] = useState<{ origin_address: string; destination_address: string } | null>(null);
  const [tripDetailsLoading, setTripDetailsLoading] = useState(false);
  const [routeFilterEnabled, setRouteFilterEnabled] = useState(false);
  const [routeDestination, setRouteDestination] = useState<{ areaLabel: string; fullAddress: string; lat: number; lng: number } | null>(null);
  const [routePreferenceSaving, setRoutePreferenceSaving] = useState(false);
  const [routePreferenceMessage, setRoutePreferenceMessage] = useState('');
  const routePreferenceReady = useRef(false);

  const [acceptingTripId, setAcceptingTripId] = useState<string | null>(null);
  const [raceConditionDetected, setRaceConditionDetected] = useState(false);

  const [volunteerLocation, setVolunteerLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const volunteerLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationRequestInProgress = useRef(false);
  const nearbyTripsRequestInProgress = useRef(false);
  const nearbyAssistanceRequestInProgress = useRef(false);


  const [pushLoading, setPushLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const [volunteerContactData, setVolunteerContactData] =
    useState<VolunteerContactData | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showRouteDestinationModal, setShowRouteDestinationModal] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'trips' | 'guidance' | 'account'>('trips');
  const [settingsFirstName, setSettingsFirstName] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  const [loadingNearbyTrips, setLoadingNearbyTrips] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(() =>
    readBooleanPreference(installDismissedStorageKey),
  );
  const [installCompleted, setInstallCompleted] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  const {
    canInstall,
    showManualInstructions,
    showInstallPrompt,
    install,
  } = useInstallPrompt();

  const handleInstall = async () => {
    const installed = await install();
    if (installed) {
      setInstallCompleted(true);
      setInstallMessage(null);
      writeBooleanPreference(installDismissedStorageKey);
      return;
    }
    setInstallMessage('لم يتم التثبيت. يمكنك المحاولة لاحقاً من قائمة المتصفح.');
  };

  const handleDismissInstall = () => {
    setInstallDismissed(true);
    setInstallMessage(null);
    writeBooleanPreference(installDismissedStorageKey);
  };

  const installNotice =
    showInstallPrompt && !installDismissed && !installCompleted ? (
      <InstallNotice
        canInstall={canInstall}
        showManualInstructions={showManualInstructions}
        onInstall={handleInstall}
        onDismiss={handleDismissInstall}
        message={installMessage}
      />
    ) : null;

  const configurationNotice = !hasSupabaseConfig ? (
    <div
      className="fixed top-4 left-4 right-4 z-40 mx-auto max-w-md rounded-xl border border-[#E8A33D]/40 bg-[#FBEFDC] p-3 text-right text-xs text-[#8F5A0A]"
      role="alert"
    >
      التطبيق يحتاج ضبط مفتاح Supabase العام في إعدادات النشر قبل تسجيل الدخول.
    </div>
  ) : null;

  const handleSignOut = async () => {
    try {
      if (profile?.id) await updatePresence(profile.id, false);
      await supabase.auth.signOut();
    } finally {
      activeUserId.current = null;
      supabase.removeAllChannels();
      localStorage.removeItem('shahm.pendingProfile');
      localStorage.removeItem('shahm.pendingRole');

      setSessionUser(null);
      setProfile(null);
      setIsOnline(false);
      isOnlineRef.current = false;
      setRoleSelection(null);

      setFirstName('');
      setPhone('');

      setAuthLoading(false);
      setErrorMessage(null);
      setProfileError(null);

      setPendingTrips([]);
      setActiveRequesterTrip(null);
      setActiveVolunteerTripData(null);
      setSelectedTripDetails(null);
      setSelectedTripAddresses(null);
      setRouteFilterEnabled(false);
      setRouteDestination(null);
      routePreferenceReady.current = false;

      setAcceptingTripId(null);
      setRaceConditionDetected(false);

      setVolunteerLocation(null);
      volunteerLocationRef.current = null;
      locationRequestInProgress.current = false;
      nearbyTripsRequestInProgress.current = false;
      nearbyAssistanceRequestInProgress.current = false;

      setRequestNotes('');
      setOrigin(null);
      setDestination(null);
      setSelectedPatientProfileId('');
      setShowPatientProfileForm(false);
      setAckChecked(false);
      setShowAssistanceForm(false);
      setActiveAssistanceRequest(null);
      setActiveAcceptedAssistance(null);
      setNearbyAssistanceRequests([]);

      setReportModalOpen(false);
      setReportSuccess(false);
      setAdminTab('trips');

      setVolunteerContactData(null);
      setShowSettings(false);
      setSettingsError(null);
      setSettingsSuccess(false);
    }
  };

  const fetchProfile = async (uid: string) => {
    setProfileLoading(true);
    setProfileError(null);

    try {
      const pendingProfile = JSON.parse(
        localStorage.getItem('shahm.pendingProfile') || 'null',
      );
      const { data: profileRows, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', uid)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (activeUserId.current !== uid) return;

      const preferredRole =
        localStorage.getItem('shahm.pendingRole') ||
        pendingProfile?.role ||
        localStorage.getItem('shahm.activeProfileRole');
      const explicitlyRequestedRole =
        localStorage.getItem('shahm.pendingRole') || pendingProfile?.role;
      const matchingProfile = profileRows?.find(
        (candidate) => candidate.role === preferredRole,
      );
      const data =
        matchingProfile ??
        (explicitlyRequestedRole ? null : profileRows?.[0] ?? null);

      if (!data) {
        setProfile(null);
        setRoleSelection(
          preferredRole === 'requester' || preferredRole === 'volunteer'
            ? preferredRole
            : null,
        );
        if (pendingProfile) {
          setFirstName(pendingProfile.firstName || '');
          setPhone(pendingProfile.phone || '');
          setVehicleType(pendingProfile.vehicleType || '');
          setVehicleColor(pendingProfile.vehicleColor || '');
          setVehiclePlateNumber(pendingProfile.vehiclePlateNumber || '');
          setVehicleDetailsConfirmed(pendingProfile.vehicleDataResponsibilityAck === true);
        }
      } else {
        setProfile(data);
        setRoleSelection(null);
        localStorage.removeItem('shahm.pendingRole');
        localStorage.removeItem('shahm.pendingProfile');
        try {
          localStorage.setItem('shahm.activeProfileRole', data.role);
        } catch {
          // Remembering the active role is optional when storage is unavailable.
        }
        if (data.role === 'volunteer') {
          setVehicleType(data.vehicle_type || '');
          setVehicleColor(data.vehicle_color || '');
          setVehiclePlateNumber(data.vehicle_plate_number || '');
          setVehicleDetailsConfirmed(data.vehicle_data_responsibility_ack === true);
        }
      }
    } catch (error: unknown) {
      setProfile(null);
      const responseError =
        typeof error === 'object' && error !== null
          ? error as { message?: unknown; code?: unknown }
          : null;
      const message =
        error instanceof Error
          ? error.message
          : typeof responseError?.message === 'string'
            ? responseError.message
            : 'تعذر تحميل بيانات المستخدم';
      const code = typeof responseError?.code === 'string' ? responseError.code : null;
      setProfileError(code ? `${message} (${code})` : message);
    } finally {
      setProfileLoading(false);
      setSessionLoading(false);
    }
  };

  const handleEnablePushNotifications = async () => {
    if (pushLoading || pushEnabled) return;

    setPushError(null);
    setPushLoading(true);

    try {
      const enabled = await registerPushNotifications(profile?.id, {
        requestPermission: true,
      });
      if (enabled) {
        setPushEnabled(true);
      } else {
        let message = 'تعذر حفظ تسجيل الإشعارات لهذا الحساب. تحقق من اتصالك ثم حاول مرة أخرى.';
        if (
          typeof Notification === 'undefined' ||
          !('serviceWorker' in navigator) ||
          !('PushManager' in window)
        ) {
          message = 'هذا المتصفح لا يدعم الإشعارات الفورية. جرّب Chrome أو ثبّت التطبيق على الشاشة الرئيسية.';
        } else if (!window.isSecureContext) {
          message = 'تفعيل الإشعارات يحتاج إلى اتصال آمن عبر HTTPS.';
        } else if (Notification.permission === 'denied') {
          message = 'الإشعارات محظورة من إعدادات المتصفح. اسمح بها ثم أعد المحاولة.';
        }
        setPushError(message);
      }
    } catch (error) {
      console.error('Enable push notifications failed:', error);
      setPushError('تعذر تفعيل الإشعارات. حاول مرة أخرى.');
    } finally {
      setPushLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setPushEnabled(false);
    setPushError(null);

    if (!profile?.id) return () => { cancelled = true; };

    // Re-sync an existing permission/subscription silently. Browsers require
    // the permission prompt itself to be triggered by an explicit user action.
    void registerPushNotifications(profile.id).then((enabled) => {
      if (!cancelled) setPushEnabled(enabled);
    });

    return () => { cancelled = true; };
  }, [profile?.id]);

  const requestVolunteerLocation = () => {
    if (locationRequestInProgress.current) return;
    if (!navigator.geolocation) {
      console.warn('Volunteer location is unavailable in this browser.');
      return;
    }

    locationRequestInProgress.current = true;

    try {
      navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          console.warn('Could not read volunteer coordinates.');
          locationRequestInProgress.current = false;
          return;
        }

        const nextLocation = { lat, lng };
        volunteerLocationRef.current = nextLocation;
        setVolunteerLocation(nextLocation);
        locationRequestInProgress.current = false;
      },
      (error) => {
        console.warn('Could not refresh volunteer location:', error.code);
        locationRequestInProgress.current = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
      );
    } catch (error) {
      console.error('Requesting volunteer location failed:', error);
      locationRequestInProgress.current = false;
    }
  };

  const loadNearbyTrips = async (locationOverride?: {
    lat: number;
    lng: number;
  }) => {
    if (profile?.role !== 'volunteer' || !routePreferenceReady.current) return;

    const location = locationOverride || volunteerLocation;
    if (!location || nearbyTripsRequestInProgress.current) return;

    nearbyTripsRequestInProgress.current = true;
    setLoadingNearbyTrips(true);

    try {
      const { data, error } = await supabase.rpc(
        'get_nearby_medical_trips',
        {
          p_lat: location.lat,
          p_lng: location.lng,
        },
      ).abortSignal(AbortSignal.timeout(15000));

      if (error) throw error;
      const trips = (data || []).map((row: MedicalTripNearby) => ({
        ...row,
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        requester_relation: row.requester_relation,
      })) as PublicTrip[];
      setPendingTrips(trips);
      trips.forEach((trip) => { if (trip.requester_id) void loadRatingSummary(trip.requester_id); });
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'تعذر تحميل الطلبات القريبة',
      );
    } finally {
      nearbyTripsRequestInProgress.current = false;
      setLoadingNearbyTrips(false);
    }
  };

  const loadVolunteerRoutePreference = async (profileId: string) => {
    const { data, error } = await supabase.from('volunteer_route_preferences').select('enabled,destination_label,destination_address,destination_lat,destination_lng').eq('volunteer_profile_id', profileId).maybeSingle();
    if (error) { console.error('Loading route preference failed:', error); routePreferenceReady.current = true; return; }
    routePreferenceReady.current = true;
    setRouteFilterEnabled(data?.enabled === true);
    setRouteDestination(data?.destination_lat != null && data?.destination_lng != null ? {
      areaLabel: data.destination_label || '', fullAddress: data.destination_address || '',
      lat: Number(data.destination_lat), lng: Number(data.destination_lng),
    } : null);
    if (volunteerLocationRef.current) {
      void loadNearbyTrips(volunteerLocationRef.current);
      void loadNearbyAssistanceRequests(volunteerLocationRef.current);
    }
  };

  const refreshPresenceCounts = async () => {
    const { data, error } = await supabase.rpc('get_presence_counts');
    if (error) { console.error('Loading online user counts failed:', error); setPresenceCounts({ shahm: null, patient: null }); return; }
    const row = data?.[0];
    if (row) setPresenceCounts({ shahm: Number(row.shahm_count) || 0, patient: Number(row.patient_count) || 0 });
  };

  const updatePresence = async (profileId: string, online: boolean) => {
    const { error } = await supabase.rpc('update_my_presence', { p_profile_id: profileId, p_is_online: online });
    if (error) { console.error('Updating availability failed:', error); return false; }
    return true;
  };

  const loadRatingSummary = async (profileId: string) => {
    const { data, error } = await supabase.rpc('get_rating_summary', { p_profile_id: profileId });
    if (error || !data?.[0]) {
      if (error) console.error('Loading rating summary failed:', error);
      if (error?.code === 'PGRST202') {
        setRatingSummaries((previous) => ({ ...previous, [profileId]: DEFAULT_RATING_SUMMARY }));
        if (profile?.id === profileId) setProfileRating(DEFAULT_RATING_SUMMARY);
        return DEFAULT_RATING_SUMMARY;
      }
      return null;
    }
    const summary = {
      average_rating: Number(data[0].average_rating) || 5,
      rating_count: Number(data[0].rating_count) || 0,
      positive_percentage: data[0].positive_percentage == null ? null : Number(data[0].positive_percentage),
    } satisfies RatingSummary;
    setRatingSummaries((previous) => ({ ...previous, [profileId]: summary }));
    if (profile?.id === profileId) setProfileRating(summary);
    return summary;
  };

  const loadTripToRate = async (profileId: string) => {
    const { data, error } = await supabase.rpc('get_my_trip_to_rate', { p_profile_id: profileId });
    if (error) {
      console.error('Loading a trip awaiting rating failed:', error);
      setTripToRate(null);
      setErrorMessage('تعذر تحميل تقييم الرحلة. حدّث الصفحة وحاول مرة أخرى.');
      return;
    }
    const trip = data?.[0] as TripToRate | undefined;
    setTripToRate(trip ?? null);
    const nextTripId = trip?.trip_id ?? null;
    if (currentRatingTripId.current !== nextTripId) {
      currentRatingTripId.current = nextTripId;
      setSelectedTripStars(5);
      setSelectedTripRatingWord(profile?.role === 'requester' ? PATIENT_RATING_WORDS[0] : VOLUNTEER_RATING_WORDS[0]);
    }
    if (trip?.other_profile_id) void loadRatingSummary(trip.other_profile_id);
  };

  const handleRateTrip = async () => {
    if (!profile?.id || !tripToRate || ratingSubmitting) return;
    setRatingSubmitting(true);
    const { error } = await supabase.rpc('rate_medical_trip', {
      p_trip_id: tripToRate.trip_id,
      p_rater_profile_id: profile.id,
      p_stars: selectedTripStars,
      p_verbal_feedback: selectedTripRatingWord,
    });
    setRatingSubmitting(false);
    if (error) { setErrorMessage(`تعذر حفظ التقييم: ${error.message}`); return; }
    setTripToRate(null);
    setSelectedTripRatingWord('');
    void loadRatingSummary(profile.id);
    void loadTripToRate(profile.id);
  };

  const handleAvailabilityToggle = async () => {
    if (!profile?.id) return;
    const nextOnline = !isOnlineRef.current;
    isOnlineRef.current = nextOnline;
    setIsOnline(nextOnline);
    await updatePresence(profile.id, nextOnline);
    void refreshPresenceCounts();
  };

  const saveVolunteerRoutePreference = async (enabled = routeFilterEnabled) => {
    if (!profile?.id || (enabled && !routeDestination)) return false;
    setRoutePreferenceSaving(true); setRoutePreferenceMessage('');
    const { error } = await supabase.from('volunteer_route_preferences').upsert({
      volunteer_profile_id: profile.id, enabled,
      destination_label: routeDestination?.areaLabel || null,
      destination_address: routeDestination?.fullAddress || null,
      destination_lat: routeDestination?.lat ?? null, destination_lng: routeDestination?.lng ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'volunteer_profile_id' });
    setRoutePreferenceSaving(false);
    if (error) { setRoutePreferenceMessage('تعذر حفظ وجهتك الآن. حاول مرة أخرى.'); return false; }
    setRouteFilterEnabled(enabled);
    setRoutePreferenceMessage(enabled ? 'تم حفظ وجهتك، وستظهر الطلبات الواقعة باتجاهها.' : 'تم إيقاف فلترة الطلبات حسب الوجهة.');
    if (volunteerLocation) { void loadNearbyTrips(volunteerLocation); void loadNearbyAssistanceRequests(volunteerLocation); }
    return true;
  };

  const openTripDetails = async (trip: PublicTrip) => {
    setSelectedTripDetails(trip); setSelectedTripAddresses(null); setTripDetailsLoading(true); setErrorMessage(null);
    if (!volunteerLocation) { setTripDetailsLoading(false); return; }
    const { data, error } = await supabase.rpc('get_pending_medical_trip_route', {
      p_trip_id: trip.id, p_volunteer_lat: volunteerLocation.lat, p_volunteer_lng: volunteerLocation.lng,
    });
    setTripDetailsLoading(false);
    if (error || !data?.[0]) return;
    setSelectedTripAddresses(data[0]);
  };

  const loadNearbyAssistanceRequests = async (locationOverride?: { lat: number; lng: number }) => {
    if (profile?.role !== 'volunteer' || !routePreferenceReady.current) return;
    const location = locationOverride || volunteerLocation;
    if (!location || nearbyAssistanceRequestInProgress.current) return;
    nearbyAssistanceRequestInProgress.current = true;
    try {
      const { data, error } = await supabase.rpc('get_nearby_captain_assistance_requests', {
        p_lat: location.lat,
        p_lng: location.lng,
        p_radius_km: 7,
      }).abortSignal(AbortSignal.timeout(15000));
      if (!error) setNearbyAssistanceRequests((data || []) as NearbyCaptainAssistance[]);
    } catch (error) {
      console.error('Loading nearby assistance requests failed:', error);
    } finally {
      nearbyAssistanceRequestInProgress.current = false;
    }
  };

  const loadActiveVolunteerTrip = async (uid: string) => {
    const { data, error } = await supabase.rpc('get_my_accepted_medical_trip');
    if (!error && data?.length) {
      const trip = data[0] as MedicalTripContact;
      setActiveVolunteerTripData(trip);
      currentRatingTripId.current = null;
      setTripToRate(null);
      if (trip.requester_profile_id) void loadRatingSummary(trip.requester_profile_id);
    } else {
      setActiveVolunteerTripData(null);
      if (!error && profile?.id === uid) void loadTripToRate(uid);
    }
  };

  const loadActiveAssistanceRequest = async () => {
    const { data, error } = await supabase.rpc('get_my_captain_assistance_request');
    if (!error) setActiveAssistanceRequest(data?.[0] as CaptainAssistanceRequest | undefined ?? null);
  };

  const loadAcceptedAssistance = async () => {
    const { data, error } = await supabase.rpc('get_my_accepted_captain_assistance_request');
    if (!error) setActiveAcceptedAssistance(data?.[0] as AcceptedCaptainAssistance | undefined ?? null);
  };

  useEffect(() => {
    if (!profile?.id) return;
    const initialOnline = profile.is_online !== false;
    isOnlineRef.current = initialOnline;
    setIsOnline(initialOnline);
    const heartbeat = () => {
      void updatePresence(profile.id, isOnlineRef.current);
      void refreshPresenceCounts();
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 60000);
    return () => window.clearInterval(timer);
  }, [profile?.id]);

  useEffect(() => {
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
      const userChanged = activeUserId.current !== (nextUser?.id ?? null);
      const shouldLoadProfile = userChanged ||
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'USER_UPDATED' ||
        event === 'PASSWORD_RECOVERY';
      setSessionUser(nextUser);
      activeUserId.current = nextUser?.id ?? null;

      if (!nextUser) {
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
        setSessionLoading(false);
      } else if (shouldLoadProfile) {
        // Defer Supabase queries until after the auth callback releases its internal lock.
        window.setTimeout(() => {
          if (!cancelled && activeUserId.current === nextUser.id) {
            void fetchProfile(nextUser.id);
          }
        }, 0);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    setProfileRating(null);
    setRatingSummaries({});
    currentRatingTripId.current = null;
    setTripToRate(null);
    void loadRatingSummary(profile.id);

    if (profile.role === 'requester') {
      const fetchActiveRequesterTrip = async () => {
        const { data, error } = await supabase.rpc('get_my_active_medical_trip');
        if (error) {
          setErrorMessage(error.message);
          return;
        }
        const row = data?.[0];
        if (!row) {
          setActiveRequesterTrip(null);
          setVolunteerContactData(null);
          void loadTripToRate(profile.id);
          return;
        }
        currentRatingTripId.current = null;
        setTripToRate(null);
        const trip: PublicTrip = {
          id: row.trip_id,
          requester_id: profile.id,
          volunteer_id: row.volunteer_profile_id ?? null,
          origin_area_label: row.origin_area_label,
          destination_area_label: row.destination_area_label,
          status: row.status,
          requester_relation: row.requester_relation,
          scheduled_at: row.created_at,
          created_at: row.created_at,
          problem_type: 'نقل مريض',
          people_count: row.people_count,
          request_notes: row.request_notes,
          patient_profile_id: row.patient_profile_id,
        };
        setActiveRequesterTrip(trip);
        if (row.volunteer_profile_id) void loadRatingSummary(row.volunteer_profile_id);
        if (row.status === 'accepted' && row.volunteer_phone) {
          setVolunteerContactData({
            trip_id: row.trip_id,
            volunteer_first_name: row.volunteer_first_name,
            volunteer_phone: row.volunteer_phone,
            accepted_at: row.accepted_at,
            distance_km: row.distance_km,
            vehicle_type: row.vehicle_type,
            vehicle_color: row.vehicle_color,
            vehicle_plate_number: row.vehicle_plate_number,
            volunteer_profile_id: row.volunteer_profile_id,
          });
        } else {
          setVolunteerContactData(null);
        }
      };

      fetchActiveRequesterTrip();

      const requesterChannel = supabase
        .channel(`trips-requester-realtime-${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'trips',
            filter: `requester_id=eq.${profile.id}`,
          },
          () => fetchActiveRequesterTrip(),
        )
        .subscribe();

      return () => {
        supabase.removeChannel(requesterChannel);
      };
    }

    if (profile.role === 'volunteer') {
      void loadVolunteerRoutePreference(profile.id);
      requestVolunteerLocation();
      void loadActiveVolunteerTrip(profile.id);
      void loadActiveAssistanceRequest();
      void loadAcceptedAssistance();

      const channel = supabase
        .channel(`trips-realtime-${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'trips',
            filter: `volunteer_id=eq.${profile.id}`,
          },
          () => {
            void loadActiveVolunteerTrip(profile.id);
          },
        )
        .subscribe();

      const assistanceChannel = supabase
        .channel(`captain-assistance-participant-${profile.id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'captain_assistance_requests',
          filter: `requester_profile_id=eq.${profile.id}`,
        }, () => { void loadActiveAssistanceRequest(); })
        .subscribe();

      const refreshTimer = window.setInterval(() => {
        requestVolunteerLocation();
        const currentLocation = volunteerLocationRef.current;
        if (currentLocation) {
          void loadNearbyTrips(currentLocation);
          void loadNearbyAssistanceRequests(currentLocation);
        }
        void loadActiveAssistanceRequest();
        void loadAcceptedAssistance();
        void loadActiveVolunteerTrip(profile.id);
      }, 60000);

      return () => {
        window.clearInterval(refreshTimer);
        supabase.removeChannel(channel);
        supabase.removeChannel(assistanceChannel);
      };
    }

    if (
      profile.role === 'ops_admin' ||
      profile.role === 'super_admin' ||
      profile.role === 'analytics_viewer'
    ) {
      const channel = supabase
        .channel(`admin-trips-realtime-${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'trips',
          },
          () => {},
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.role !== 'volunteer' || !volunteerLocation) {
      return;
    }

    void loadNearbyTrips(volunteerLocation);
    void loadNearbyAssistanceRequests(volunteerLocation);
    void reportVolunteerLocation(volunteerLocation.lat, volunteerLocation.lng);
  }, [profile?.role, volunteerLocation]);

  useEffect(() => {
    if (profile?.role !== 'requester') {
      setPatientProfiles([]);
      return;
    }
    let cancelled = false;
    supabase.from('patient_profiles').select('*').eq('requester_profile_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErrorMessage(error.message);
        else {
          const patients = (data || []) as PatientProfile[];
          setPatientProfiles(patients);
          setSelectedPatientProfileId((current) =>
            patients.some((patient) => patient.id === current)
              ? current
              : patients[0]?.id || '',
          );
          setShowPatientProfileForm(patients.length === 0);
        }
      });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.role]);

  const handleOpenSettings = () => {
    setSettingsFirstName(profile?.first_name ?? '');
    setSettingsPhone(profile?.phone_number ?? '');
    setSettingsError(null);
    setSettingsSuccess(false);
    setShowSettings(true);
  };

  const handleCloseSettings = () => {
    setShowSettings(false);
    setActiveBottomTab('trips');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveSettings = async () => {
    setSettingsError(null);
    setSettingsSuccess(false);

    const firstName = settingsFirstName.trim().replace(/\s+/g, ' ');
    let phoneNumber = normalizeDigits(settingsPhone.trim())
      .replace(/[\s()+-]/g, '');
    if (phoneNumber.startsWith('0020')) {
      phoneNumber = `0${phoneNumber.slice(4)}`;
    } else if (phoneNumber.startsWith('20') && phoneNumber.length === 12) {
      phoneNumber = `0${phoneNumber.slice(2)}`;
    } else if (/^1[0125]\d{8}$/.test(phoneNumber)) {
      phoneNumber = `0${phoneNumber}`;
    }

    if (!profile?.id) {
      setSettingsError('تعذر تحديد حسابك. أعد تحميل الصفحة ثم حاول مرة أخرى.');
      return;
    }

    if (firstName.length < 2 || firstName.length > 40 || !/^01[0125]\d{8}$/.test(phoneNumber)) {
      setSettingsError('أدخل اسمًا من حرفين على الأقل ورقم هاتف مصري صحيحًا.');
      return;
    }

    setSettingsSaving(true);
    try {
      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update({ first_name: firstName, phone_number: phoneNumber })
        .eq('id', profile.id)
        .select()
        .single();

      if (error) throw error;
      if (!updatedProfile) throw new Error('لم يتم العثور على بيانات الحساب للتحديث.');

      setProfile(updatedProfile);
      setSettingsFirstName(firstName);
      setSettingsPhone(phoneNumber);

      // Pending registration data is optional and can be unavailable in some browsers.
      try {
        const pendingProfile = localStorage.getItem('shahm.pendingProfile');
        if (pendingProfile) {
          localStorage.setItem(
            'shahm.pendingProfile',
            JSON.stringify({
              ...JSON.parse(pendingProfile),
              firstName,
              phone: phoneNumber,
            }),
          );
        }
      } catch {
        // The saved profile in Supabase is authoritative.
      }

      setSettingsSuccess(true);
    } catch (error) {
      console.error('Save account settings failed:', error);
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
      setSettingsError(
        code === '42501'
          ? 'لا تتوفر صلاحية تعديل هذا الحساب. سجّل الخروج ثم ادخل مرة أخرى.'
          : 'تعذر حفظ بيانات الحساب. تحقق من الاتصال ثم حاول مرة أخرى.',
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSaveVolunteerVehicleDetails = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVehicleProfileError(null);

    if (!hasCompleteVolunteerVehicleDetails({
      vehicle_type: vehicleType,
      vehicle_color: vehicleColor,
      vehicle_plate_number: vehiclePlateNumber,
      vehicle_data_responsibility_ack: vehicleDetailsConfirmed,
    })) {
      setVehicleProfileError('أكمل بيانات السيارة ووافق على إقرار المسؤولية للمتابعة.');
      return;
    }

    setVehicleProfileSaving(true);
    const { data, error } = await supabase
      .from('profiles')
      .update({
        vehicle_type: vehicleType.trim(),
        vehicle_color: vehicleColor.trim(),
        vehicle_plate_number: vehiclePlateNumber.trim(),
        vehicle_data_responsibility_ack: true,
      })
      .eq('id', profile.id)
      .select()
      .single();
    setVehicleProfileSaving(false);

    if (error) {
      setVehicleProfileError(error.message);
      return;
    }
    setProfile(data);
    setVehicleDetailsConfirmed(true);
  };

  const handleGoogleLogin = async (role: UserRole) => {
    setErrorMessage(null);
    setRoleSelection(role);

    if (sessionUser) return;

    try {
      localStorage.setItem('shahm.pendingRole', role);
    } catch {
      setErrorMessage('تعذر حفظ الدور المختار. فعّل مساحة التخزين ثم أعد المحاولة.');
      return;
    }

    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (error: unknown) {
      setAuthLoading(false);
      setErrorMessage(
        `تعذر تسجيل الدخول عبر Google: ${error instanceof Error ? error.message : 'حاول مرة أخرى.'}`,
      );
    }
  };

  const handleSaveNewProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!sessionUser || !roleSelection) return;

    const normalizedName = firstName.trim().replace(/\s+/g, ' ');
    const nameLetters = normalizedName.match(/[\p{L}\p{M}]/gu) ?? [];
    const compactName = normalizedName.replace(/[\s'-]/g, '').toLocaleLowerCase();
    if (
      !/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(normalizedName) ||
      nameLetters.length < 2 ||
      /^(.)\1+$/u.test(compactName)
    ) {
      setErrorMessage('اكتب اسمًا حقيقيًا بحروف عربية أو إنجليزية، من دون أرقام أو رموز.');
      return;
    }

    const phoneDigits = normalizeDigits(phone.trim())
      .replace(/[\s()+-]/g, '');
    if (!/^01[0125]\d{8}$/.test(phoneDigits)) {
      setErrorMessage('اكتب رقم موبايل مصري صحيحًا من 11 رقمًا ويبدأ بـ 010 أو 011 أو 012 أو 015.');
      return;
    }

    const normalizedPlate = normalizeDigits(vehiclePlateNumber.trim());
    if (roleSelection === 'volunteer') {
      if (
        !hasMeaningfulLetters(vehicleType) || vehicleType.trim().length > 80 ||
        !hasMeaningfulLetters(vehicleColor) || vehicleColor.trim().length > 40 ||
        normalizedPlate.length < 3 || normalizedPlate.length > 24 ||
        !/[\p{L}]/u.test(normalizedPlate) || !/\d/.test(normalizedPlate)
      ) {
        setErrorMessage('اكتب نوع السيارة ولونها، ورقم لوحة يحتوي على حروف وأرقام.');
        return;
      }
      if (!vehicleDetailsConfirmed) {
        setErrorMessage('لازم توافق على إقرار صحة بيانات السيارة ومسؤوليتك عنها.');
        return;
      }
    }

    setProfileSaving(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          auth_user_id: sessionUser.id,
          first_name: normalizedName,
          phone_number: phoneDigits,
          role: roleSelection,
          verification_status: 'unverified',
          ...(roleSelection === 'volunteer'
            ? {
                vehicle_type: vehicleType.trim(),
                vehicle_color: vehicleColor.trim(),
                vehicle_plate_number: normalizedPlate,
                vehicle_data_responsibility_ack: true,
              }
            : {}),
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          await fetchProfile(sessionUser.id);
          setRoleSelection(null);
          setAddingRequesterProfile(false);
          return;
        }
        throw error;
      }

      setProfile(data);
      setRoleSelection(null);
      setAddingRequesterProfile(false);
      if (data.role === 'requester' && canReturnToVolunteer) {
        setCanReturnToVolunteer(true);
      }
      setProfileError(null);
      localStorage.removeItem('shahm.pendingRole');
      localStorage.removeItem('shahm.pendingProfile');
      try {
        localStorage.setItem('shahm.activeProfileRole', data.role);
      } catch {
        // The database profile remains authoritative when storage is unavailable.
      }
      if (data.role === 'volunteer') {
        setVehicleDetailsConfirmed(true);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ بيانات الحساب.';
      setErrorMessage(`تعذر حفظ بيانات التسجيل: ${message}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleOpenHelpRequest = async () => {
    if (!sessionUser || profile?.role !== 'volunteer') return;
    setErrorMessage(null);
    setAssistanceIssueType('');
    setAssistanceNotes('');
    setAssistanceLocation(null);
    setAckChecked(false);
    setShowAssistanceForm(true);
  };

  const handleReturnToVolunteer = async () => {
    if (!sessionUser) return;

    setErrorMessage(null);
    setProfileLoading(true);

    try {
      const { data: volunteerProfile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', sessionUser.id)
        .eq('role', 'volunteer')
        .maybeSingle();

      if (error) throw error;
      if (!volunteerProfile) throw new Error('تعذر العثور على ملف الشهم.');

      setProfile(volunteerProfile);
      setCanReturnToVolunteer(false);
      try {
        localStorage.setItem('shahm.activeProfileRole', 'volunteer');
      } catch {
        // The selected profile remains active for this session.
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر العودة إلى شاشة الشهم.',
      );
    } finally {
      setProfileLoading(false);
    }
  };

  const handleCreateTrip = async () => {
    if (!origin || !destination || !ackChecked || !selectedPatientProfileId) {
      return;
    }

    setCreateTripLoading(true);
    setErrorMessage(null);

    try {
      const requestNow = new Date().toISOString();
      const session = (await supabase.auth.getSession()).data.session;

      if (!session?.access_token) {
        throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
      }

      const { data: resJson, error: functionError } =
        await supabase.functions.invoke<{ trip_id?: string }>(
          'create-trip-proxy',
          {
            body: {
              origin_area_label: origin.areaLabel,
              origin_address: origin.fullAddress,
              origin_lat: origin.lat,
              origin_lng: origin.lng,
              destination_area_label: destination.areaLabel,
              destination_address: destination.fullAddress,
              destination_lat: destination.lat,
              destination_lng: destination.lng,
              requester_relation: requesterRelation,
              people_count: Number(peopleCount),
              request_notes: requestNotes.trim(),
              patient_profile_id: selectedPatientProfileId,
            },
          },
        );

      if (functionError) {
        let message = functionError.message;
        if (functionError.context instanceof Response) {
          try {
            const body = await functionError.context.clone().json();
            if (typeof body?.error === 'string') message = body.error;
          } catch {
            // Keep the Functions SDK error when the response is not JSON.
          }
        }
        throw new Error(message);
      }

      if (!resJson?.trip_id) {
        throw new Error('تم استلام الطلب بدون رقم طلب من الخادم');
      }

      const newTrip: PublicTrip = {
        id: resJson.trip_id,
        requester_id: profile?.id || session.user.id,
        volunteer_id: null,
        origin_area_label: origin.areaLabel,
        destination_area_label: destination.areaLabel,
        status: 'pending',
        requester_relation: requesterRelation,
        scheduled_at: requestNow,
        created_at: requestNow,
        problem_type: 'نقل مريض',
        people_count: Number(peopleCount),
        request_notes: requestNotes.trim(),
        patient_profile_id: selectedPatientProfileId,
        accepted_at: null,
        completed_at: null,
      };

      setActiveRequesterTrip(newTrip);
      setRequestNotes('');
      setOrigin(null);
      setDestination(null);
      setAckChecked(false);
    } catch (err: any) {
      setErrorMessage(
        (err?.message === 'Failed to fetch' || err?.name === 'FunctionsFetchError')
          ? 'تعذر الاتصال بخدمة إرسال الطلب. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.'
          : err?.message || 'تعذر إنشاء طلب المساعدة.',
      );
    } finally {
      setCreateTripLoading(false);
    }
  };

  const handleSavePatientProfile = async () => {
    if (profile?.role !== 'requester' || !patientName.trim() || !patientPhone.trim()) return;
    if (patientName.trim().length < 2 || patientName.trim().length > 120) {
      setErrorMessage('اكتب اسم المريض من حرفين إلى 120 حرفًا.');
      return;
    }
    const normalizedPatientPhone = normalizeDigits(patientPhone.trim()).replace(/[\s()+-]/g, '');
    const parsedAge = patientAgeInput.trim() ? Number(patientAgeInput) : null;
    if (!/^01[0125]\d{8}$/.test(normalizedPatientPhone)) {
      setErrorMessage('أدخل رقم هاتف مصري صحيح للمريض.');
      return;
    }
    if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 120)) {
      setErrorMessage('أدخل عمرًا صحيحًا من 0 إلى 120 أو اتركه فارغًا.');
      return;
    }
    if (patientConditionInput.trim().length > 1000) {
      setErrorMessage('يجب ألا تتجاوز ملاحظات الحالة الصحية 1000 حرف.');
      return;
    }
    setSavingPatientProfile(true);
    setErrorMessage(null);
    const patientData = {
      full_name: patientName.trim(),
      phone_number: normalizedPatientPhone,
      age: parsedAge,
      condition_description: patientConditionInput.trim() || null,
    };
    try {
      const query = editingPatientProfileId
        ? supabase.from('patient_profiles').update(patientData)
          .eq('id', editingPatientProfileId)
          .eq('requester_profile_id', profile.id)
        : supabase.from('patient_profiles').insert({ ...patientData, requester_profile_id: profile.id });
      const { data, error } = await query.select('*').single();
      if (error) throw error;
      const savedPatient = data as PatientProfile;
      if (editingPatientProfileId) {
        setPatientProfiles((rows) => rows.map((row) => row.id === savedPatient.id ? savedPatient : row));
      } else {
        setPatientProfiles((rows) => [savedPatient, ...rows]);
      }
      setSelectedPatientProfileId(savedPatient.id);
      setPatientName('');
      setPatientPhone('');
      setPatientAgeInput('');
      setPatientConditionInput('');
      setEditingPatientProfileId(null);
      setShowPatientProfileForm(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر حفظ بيانات المريض. حاول مرة أخرى.');
    } finally {
      setSavingPatientProfile(false);
    }
  };

  const handleEditSelectedPatient = () => {
    const patient = patientProfiles.find((row) => row.id === selectedPatientProfileId);
    if (!patient) return;
    setPatientName(patient.full_name);
    setPatientPhone(patient.phone_number);
    setPatientAgeInput(patient.age === null ? '' : String(patient.age));
    setPatientConditionInput(patient.condition_description || '');
    setEditingPatientProfileId(patient.id);
    setShowPatientProfileForm(true);
    setErrorMessage(null);
  };

  const handleCancelPatientProfileForm = () => {
    setPatientName('');
    setPatientPhone('');
    setPatientAgeInput('');
    setPatientConditionInput('');
    setEditingPatientProfileId(null);
    setShowPatientProfileForm(false);
    setErrorMessage(null);
  };

  const handleCreateAssistanceRequest = async () => {
    if (!assistanceLocation || !assistanceIssueType || !ackChecked || profile?.role !== 'volunteer') return;
    setCreatingAssistanceRequest(true);
    setErrorMessage(null);
    const { data, error } = await supabase.rpc('create_captain_assistance_request', {
      p_issue_type: assistanceIssueType,
      p_notes: assistanceNotes.trim(),
      p_location_label: assistanceLocation.areaLabel,
      p_location_address: assistanceLocation.fullAddress,
      p_lat: assistanceLocation.lat,
      p_lng: assistanceLocation.lng,
    });
    setCreatingAssistanceRequest(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setShowAssistanceForm(false);
    setAssistanceLocation(null);
    setAssistanceIssueType('');
    setAssistanceNotes('');
    setAckChecked(false);
    setErrorMessage(null);
    void loadActiveAssistanceRequest();
    setActiveAssistanceRequest({
      request_id: data,
      issue_type: assistanceIssueType,
      notes: assistanceNotes.trim(),
      location_label: assistanceLocation.areaLabel,
      status: 'pending',
      created_at: new Date().toISOString(),
      accepted_at: null,
      accepted_distance_km: null,
      helper_name: null,
      helper_phone: null,
      vehicle_type: null,
      vehicle_color: null,
      vehicle_plate_number: null,
    });
  };

  const handleAcceptAssistanceRequest = async (requestId: string) => {
    if (!volunteerLocation) return;
    setAcceptingTripId(requestId);
    setErrorMessage(null);
    const { data, error } = await supabase.rpc('accept_captain_assistance_request', {
      p_request_id: requestId,
      p_lat: volunteerLocation.lat,
      p_lng: volunteerLocation.lng,
    });
    setAcceptingTripId(null);
    if (error) {
      setErrorMessage('تعذر قبول طلب المساعدة. حدّث موقعك وتحقق من اتصالك ثم حاول مرة أخرى.');
      void loadNearbyAssistanceRequests();
      return;
    }
    setActiveAcceptedAssistance(data?.[0] as AcceptedCaptainAssistance ?? null);
    setNearbyAssistanceRequests((rows) => rows.filter((row) => row.id !== requestId));
  };

  const handleCancelAssistanceRequest = async () => {
    if (!activeAssistanceRequest) return;
    const { error } = await supabase.rpc('cancel_captain_assistance_request', { p_request_id: activeAssistanceRequest.request_id });
    if (error) setErrorMessage(error.message);
    else setActiveAssistanceRequest(null);
  };

  const handleCompleteAssistanceRequest = async (requestId: string) => {
    const { error } = await supabase.rpc('complete_captain_assistance_request', { p_request_id: requestId });
    if (error) setErrorMessage(error.message);
    else {
      setActiveAssistanceRequest(null);
      setActiveAcceptedAssistance(null);
      void loadNearbyAssistanceRequests();
    }
  };

  const handleAcceptTrip = async (tripId: string) => {
    if (!volunteerLocation) {
      setErrorMessage('لازم نحدد موقعك الحالي قبل قبول المشوار.');
      requestVolunteerLocation();
      return;
    }

    setAcceptingTripId(tripId);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc('accept_medical_trip', {
      p_trip_id: tripId,
      p_volunteer_lat: volunteerLocation.lat,
      p_volunteer_lng: volunteerLocation.lng,
    });

    setAcceptingTripId(null);

    if (error) {
      if (error.message.includes('تم قبول هذا الطلب من متطوع آخر')) {
        setRaceConditionDetected(true);
      } else if (error.message.includes('volunteer vehicle details required')) {
        setErrorMessage('أكمل بيانات السيارة وإقرار المسؤولية قبل قبول المشوار.');
      } else {
        setErrorMessage('تعذر قبول الطلب. حدّث موقعك وتحقق من اتصالك ثم حاول مرة أخرى.');
      }

      setSelectedTripDetails(null);
      await loadNearbyTrips(volunteerLocation);
      return;
    }

    if (data && data.length > 0) {
      setActiveVolunteerTripData(data[0] as MedicalTripContact);
      setSelectedTripDetails(null);
      setPendingTrips((prev) => prev.filter((trip) => trip.id !== tripId));

      void (async () => {
        try {
          const session = (await supabase.auth.getSession()).data.session;
          if (!session?.access_token) return;

          await fetch(`${supabaseUrl}/functions/v1/notify-trip-accepted`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ trip_id: tripId }),
          });
        } catch (notifyError) {
          console.error('notify-trip-accepted failed', notifyError);
        }
      })();
    }
  };

  const handleCancelTrip = async (tripId: string) => {
    if (!profile?.id || !cancelTripReason) return;
    const reason = cancelTripReason === 'other' ? cancelTripDetails.trim() : cancelTripReason;
    if (reason.length < 5) { setCancelTripError('اكتب سبب الإلغاء بوضوح.'); return; }
    setCancelTripSubmitting(true);
    const { error } = profile.role === 'volunteer'
      ? await supabase.rpc('volunteer_cancel_medical_trip', { p_trip_id: tripId, p_volunteer_profile_id: profile.id, p_reason: reason })
      : await supabase.rpc('cancel_medical_trip', { p_trip_id: tripId, p_requester_profile_id: profile.id, p_reason: reason });
    setCancelTripSubmitting(false);

    if (!error) {
      if (profile.role === 'volunteer') {
        setActiveVolunteerTripData(null);
        if (volunteerLocation) void loadNearbyTrips(volunteerLocation);
      } else {
        setActiveRequesterTrip(null);
      }
      setCancelTripId(null);
      setCancelTripReason('');
      setCancelTripDetails('');
      setCancelTripError(null);
    } else {
      setCancelTripError(error.message || 'تعذر إلغاء الرحلة. حاول مرة أخرى.');
    }
  };

  const handleCompleteTrip = async (tripId: string) => {
    if (!profile?.id || profile.role !== 'volunteer') return;
    const { error } = await supabase.rpc('complete_medical_trip', {
      p_trip_id: tripId,
      p_volunteer_profile_id: profile.id,
    });

    if (!error) {
      setActiveRequesterTrip(null);
      setActiveVolunteerTripData(null);
      if (profile?.id) await loadTripToRate(profile.id);
    } else {
      setErrorMessage(error.message);
    }
  };

  if (sessionLoading || (sessionUser && profileLoading)) {
    return (
      <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center p-4 text-[#6B7280]">
        <div className="flex items-center gap-2 text-sm" role="status">
          <Loader2 className="w-5 h-5 animate-spin text-[#146B44]" />
          جاري تحميل الحساب...
        </div>
      </div>
    );
  }

  if (sessionUser && profileError) {
    return (
      <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center p-4 text-center">
        <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#FCEAEA] space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-[#B53A3A]" />
          <h2 className="font-bold text-[#1F2430]">تعذر تحميل دور الحساب</h2>
          <p className="text-xs text-[#6B7280]">{profileError}</p>
          <button
            onClick={() => void fetchProfile(sessionUser.id)}
            className="text-xs text-[#146B44] font-bold"
          >
            إعادة المحاولة
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs text-[#146B44] font-bold"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  if (profile && !profile.is_active) {
    return (
      <div className="min-h-screen bg-[#F7F8F9] flex flex-col justify-center items-center p-4 text-center">
        <div className="w-16 h-16 bg-[#FCEAEA] text-[#B53A3A] rounded-full flex items-center justify-center mx-auto mb-4">
          <Ban className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-[#1F2430] mb-2">
          الحساب غير نشط مؤقتاً
        </h2>
        <p className="text-xs text-[#6B7280] max-w-xs mb-6 leading-relaxed">
          تم تعليق استخدام هذا الحساب مؤقتاً لمراجعة معايير السلامة والتكافل.
        </p>
        <button
          onClick={handleSignOut}
          className="text-xs text-[#146B44] font-bold"
        >
          تسجيل الخروج
        </button>
      </div>
    );
  }

  if (
    ((!sessionUser && !roleSelection) ||
      (sessionUser && !profile && !profileError && !roleSelection))
  ) {
    return (
      <div className="shahm-auth-page">
        <header className="shahm-public-header" aria-label="شَهْم">
          <div className="shahm-brand-lockup">
            <img aria-hidden="true" alt="" src="/shahm-logo-mark-20260924.png" />
            <span>شَهْم</span>
          </div>
          <span className="shahm-public-badge"><ShieldCheck aria-hidden="true" /> مجتمع آمن ومساند</span>
        </header>

        <main className="shahm-welcome">
          <section className="welcome-hero">
            <div className="welcome-mark">
              <span className="welcome-logo-spin" aria-hidden="true">
                <img alt="" src="/shahm-logo-mark-20260924.png" />
              </span>
            </div>
            <span className="welcome-kicker">خير الناس أنفعهم للناس</span>
            <h1>أهلاً بك في شَهْم</h1>
            <p className="welcome-lead">الناس للناس</p>
            <p className="welcome-description">منصة مجتمعية لمساعدة المصابين بأمراض مزمنة والأكثر احتياجاً</p>

            <div className="welcome-actions" aria-label="اختر طريقة استخدام شَهْم">
              <button
                onClick={() => {
                  if (sessionUser) {
                    localStorage.setItem('shahm.pendingRole', 'requester');
                    setRoleSelection('requester');
                  }
                  else void handleGoogleLogin('requester');
                }}
                className="welcome-role-card"
              >
                <span className="welcome-role-icon"><LocateFixed aria-hidden="true" /></span>
                <span className="welcome-role-copy"><strong>احتاج مساعدة</strong><small>اطلب مساندة من شهم قريب</small></span>
                <span className="welcome-role-arrow" aria-hidden="true">←</span>
              </button>
              <button
                onClick={() => {
                  if (sessionUser) {
                    localStorage.setItem('shahm.pendingRole', 'volunteer');
                    setRoleSelection('volunteer');
                  }
                  else void handleGoogleLogin('volunteer');
                }}
                className="welcome-role-card"
              >
                <span className="welcome-role-icon"><CarFront aria-hidden="true" /></span>
                <span className="welcome-role-copy"><strong>أرغب بالمساعدة</strong><small>كن شهمًا وساعد غيرك</small></span>
                <span className="welcome-role-arrow" aria-hidden="true">←</span>
              </button>
            </div>
            <p className="welcome-privacy"><ShieldCheck aria-hidden="true" /> بياناتك محفوظة وتُشارك عند الحاجة فقط</p>
          </section>

          <blockquote className="welcome-community">
            <span className="community-ornament" aria-hidden="true"><HeartHandshake /></span>
            <p>«من سار بين الناس جابراً للخواطر أدركه الله في جوف المخاطر.»</p>
          </blockquote>
        </main>

        {configurationNotice}
        {installNotice}
      </div>
    );
  }

  if (!sessionUser && roleSelection) {
    const selectedRoleLabel = roleSelection === 'requester' ? 'احتاج مساعدة' : 'أرغب بالمساعدة';
    return (
      <div className="shahm-auth-page min-h-screen bg-[#F7F8F9] flex flex-col justify-center items-center p-4">
        <div className="shahm-auth-card w-full max-w-sm bg-white p-6 rounded-2xl shadow-sm border border-[#8A949E]/20 text-center">
          <div className="signup-brand-lockup">
            <img aria-hidden="true" alt="" src="/shahm-logo-mark-20260924.png" />
            <span>شَهْم</span>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('shahm.pendingRole');
              setRoleSelection(null);
            }}
            className="text-xs text-[#6B7280] mb-4 hover:text-[#1F2430]"
          >
            ← العودة للرئيسية
          </button>
          <h2 className="text-xl font-bold text-[#1F2430] mb-2">الدخول كـ {selectedRoleLabel}</h2>
          <p className="text-sm leading-6 text-[#6B7280] mb-6">
            اختر حساب Google. بعد الدخول سنفتح حسابك مباشرة، أو نطلب بيانات هذا الدور إذا كانت أول مرة.
          </p>

          {errorMessage && (
            <div role="alert" className="p-3 mb-4 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex items-center gap-2 text-right">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleGoogleLogin(roleSelection)}
            disabled={authLoading}
            className="w-full h-[52px] bg-white border border-[#8A949E] text-[#1F2430] font-semibold rounded-xl text-base hover:bg-[#F7F8F9] transition-colors flex items-center justify-center gap-2"
          >
            {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="font-bold text-[#4285F4]">G</span>}
            اختيار حساب Google
          </button>
        </div>

        {configurationNotice}
        {installNotice}
      </div>
    );
  }

  if (sessionUser && roleSelection && (!profile || addingRequesterProfile)) {
    const selectedRoleLabel = roleSelection === 'requester' ? 'طالب المساعدة' : 'الشهم المتطوع';
    return (
      <div className="shahm-auth-page shahm-signup-page min-h-screen bg-[#F7F8F9] flex flex-col justify-center items-center p-4">
        <div className="shahm-auth-card shahm-form-card w-full max-w-sm bg-white p-6 rounded-2xl shadow-sm border border-[#8A949E]/20">
          <div className="signup-brand-lockup">
            <img aria-hidden="true" alt="" src="/shahm-logo-mark-20260924.png" />
            <span>شَهْم</span>
          </div>
          <button type="button" onClick={() => {
            localStorage.removeItem('shahm.pendingRole');
            setRoleSelection(null);
            setAddingRequesterProfile(false);
            setCanReturnToVolunteer(false);
          }} className="text-xs text-[#6B7280] mb-4 hover:text-[#1F2430]">
            {addingRequesterProfile ? 'العودة إلى شاشة الشهم' : '← تغيير الدور'}
          </button>
          <h2 className="text-xl font-bold text-[#1F2430] mb-2">
            {addingRequesterProfile ? 'استكمال بيانات طالب المساعدة' : `تسجيل بيانات ${selectedRoleLabel}`}
          </h2>
          <p className="text-sm leading-6 text-[#6B7280] mb-6">
            {addingRequesterProfile
              ? 'أدخل بيانات المريض مرة واحدة حتى نفتح لك نموذج طلب المساعدة.'
              : 'أكمل بياناتك مرة واحدة لهذا الدور. بعد الحفظ ستدخل إلى حسابك مباشرة.'}
          </p>
          {errorMessage && (
            <div role="alert" className="p-3 mb-4 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <form onSubmit={(event) => void handleSaveNewProfile(event)} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1F2430] mb-1">الاسم الحقيقي</label>
              <input type="text" autoComplete="name" required value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="مثال: أحمد محمد" className="w-full h-[52px] px-4 bg-white border border-[#8A949E] rounded-xl text-base text-[#1F2430] focus:border-[#2F6FED] focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1F2430] mb-1">رقم الموبايل المصري</label>
              <input type="tel" autoComplete="tel-national" inputMode="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" className="w-full h-[52px] px-4 bg-white border border-[#8A949E] rounded-xl text-base text-[#1F2430] focus:border-[#2F6FED] focus:outline-none" />
            </div>
            {roleSelection === 'volunteer' && (
              <div className="space-y-3 rounded-2xl border border-[#146B44]/15 bg-[#F7FBF8] p-4">
                <h3 className="text-sm font-bold text-[#005131]">بيانات السيارة</h3>
                <label className="block text-sm font-semibold text-[#1F2430]">النوع والموديل
                  <input type="text" required minLength={2} maxLength={80} value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} placeholder="مثال: تويوتا كورولا" className="mt-1 h-[48px] w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal" />
                </label>
                <label className="block text-sm font-semibold text-[#1F2430]">اللون
                  <input type="text" required minLength={2} maxLength={40} value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} placeholder="مثال: أبيض" className="mt-1 h-[48px] w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal" />
                </label>
                <label className="block text-sm font-semibold text-[#1F2430]">رقم اللوحة
                  <input type="text" required minLength={3} maxLength={24} dir="auto" value={vehiclePlateNumber} onChange={(event) => setVehiclePlateNumber(event.target.value)} placeholder="اكتب الحروف والأرقام كما تظهر على السيارة" className="mt-1 h-[48px] w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal" />
                </label>
                <label className="flex items-start gap-2 rounded-xl bg-white p-3 text-right text-xs leading-6 text-[#3f4942]">
                  <input type="checkbox" checked={vehicleDetailsConfirmed} onChange={(event) => setVehicleDetailsConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#146B44]" />
                  <span>أقرّ بأن بيانات السيارة صحيحة وعلى مسؤوليتي الشخصية.</span>
                </label>
              </div>
            )}
            <button type="submit" disabled={profileSaving} className="w-full h-[52px] bg-[#146B44] text-white font-semibold rounded-xl text-base hover:bg-[#0F5636] disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
              {profileSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {profileSaving ? 'جارٍ حفظ البيانات...' : 'حفظ البيانات والدخول'}
            </button>
          </form>
        </div>
        {configurationNotice}
        {installNotice}
      </div>
    );
  }

  if (profile?.role === 'volunteer' && !hasCompleteVolunteerVehicleDetails(profile)) {
    return (
      <div className="min-h-screen bg-[#F7F8F9] px-4 py-8">
        <form onSubmit={(event) => void handleSaveVolunteerVehicleDetails(event)} className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-[#8A949E]/20 bg-white p-5 text-right shadow-sm">
          <div className="text-center">
            <h1 className="text-xl font-bold text-[#005131]">استكمال بيانات السيارة</h1>
            <p className="mt-2 text-sm leading-6 text-[#53645a]">أدخل بيانات السيارة مرة واحدة للمتابعة واستخدام التطبيق كشهم.</p>
          </div>
          {vehicleProfileError && <p role="alert" className="rounded-xl bg-[#FCEAEA] p-3 text-sm text-[#B53A3A]">{vehicleProfileError}</p>}
          <label className="block text-sm font-semibold text-[#1F2430]">النوع والموديل
            <input type="text" required minLength={2} maxLength={80} value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} placeholder="مثال: تويوتا كورولا" className="mt-1 h-12 w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal" />
          </label>
          <label className="block text-sm font-semibold text-[#1F2430]">اللون
            <input type="text" required minLength={2} maxLength={40} value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} placeholder="مثال: أبيض" className="mt-1 h-12 w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal" />
          </label>
          <label className="block text-sm font-semibold text-[#1F2430]">رقم اللوحة
            <input type="text" required minLength={3} maxLength={24} dir="auto" value={vehiclePlateNumber} onChange={(event) => setVehiclePlateNumber(event.target.value)} placeholder="اكتب رقم اللوحة كما يظهر على السيارة" className="mt-1 h-12 w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal" />
          </label>
          <label className="flex items-start gap-2 rounded-xl bg-[#F7FBF8] p-3 text-xs leading-6 text-[#3f4942]">
            <input type="checkbox" checked={vehicleDetailsConfirmed} onChange={(event) => setVehicleDetailsConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#146B44]" />
            <span>أقرّ بأن بيانات السيارة صحيحة وعلى مسؤوليتي الشخصية، وأوافق على عدم تعديلها بعد التسجيل.</span>
          </label>
          <button type="submit" disabled={vehicleProfileSaving} className="min-h-12 w-full rounded-xl bg-[#146B44] px-4 text-sm font-bold text-white disabled:opacity-60">
            {vehicleProfileSaving ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'حفظ البيانات ومتابعة'}
          </button>
          <button type="button" onClick={handleSignOut} className="min-h-11 w-full text-sm font-semibold text-[#6B7280]">تسجيل الخروج</button>
        </form>
      </div>
    );
  }

  const isAdmin =
    profile?.role &&
    ['ops_admin', 'verification_admin', 'super_admin', 'analytics_viewer'].includes(profile.role);

  const showRequesterView = profile?.role === 'requester';
  const showVolunteerView =
    profile?.role === 'volunteer' || (isAdmin && adminTab === 'trips');
  const isProfilePage = activeBottomTab === 'account' && showSettings;
  const isGuidancePage = activeBottomTab === 'guidance' && showGuidance;
  const guidanceContent = profile?.role === 'requester'
    ? {
        title: 'إرشادات طالب المساعدة',
        intro: 'خطوات بسيطة تساعد الشهم على الوصول إليك وتقديم المساندة المناسبة.',
        items: [
          'أضف بيانات المريض مرة واحدة، ثم اختر ملفه عند إنشاء كل طلب.',
          'حدّد مكان التحرك والوجهة بدقة، واستخدم زر تحديد موقعك لتسهيل الوصول.',
          'اختر نوع المساعدة واكتب ملاحظة مختصرة توضح ما يحتاج الشهم معرفته.',
          'تابع التطبيق بعد الإرسال؛ ستظهر بيانات الشهم ووسيلة التواصل بعد قبول الطلب.',
          'إذا تغيرت الظروف، ألغِ الطلب مع اختيار السبب. وبعد انتهاء الرحلة شارك تقييمك.',
        ],
        closing: 'وضوحك وتعاونك يساعدان على وصول المساندة في الوقت المناسب.',
      }
    : profile?.role === 'volunteer'
      ? {
          title: 'إرشادات الشهم',
          intro: 'كل رحلة منظمة تمنح مريضًا فرصة للوصول إلى الرعاية براحة واطمئنان.',
          items: [
            'حدّث موقعك وحالة اتصالك عندما تكون مستعدًا لاستقبال الطلبات.',
            'راجع مكان التحرك والوجهة وتفاصيل الطلب قبل القبول، واختر ما يناسب طريقك.',
            'تواصل مع طالب المساعدة ورتّب نقطة لقاء واضحة قبل التحرك.',
            'قد السيارة بهدوء، واحرص على سلامتك وسلامة المريض طوال الرحلة.',
            'إذا طرأ ظرف يمنعك من الاستمرار، ألغِ الرحلة مع توضيح السبب. وبعد الوصول أنهِ الرحلة وشارك تقييمك.',
          ],
          closing: 'مبادرتك تصنع فرقًا حقيقيًا؛ شكرًا لأنك شهم.',
        }
      : {
          title: 'إرشادات إدارة شهم',
          intro: 'متابعة واضحة وعادلة تحفظ جودة الخدمة وثقة المجتمع.',
          items: [
            'راجع الطلبات والبلاغات من القسم المخصص لدورك.',
            'تعامل مع البلاغات بسرية، واستند إلى المعلومات المرتبطة بالرحلة.',
            'وجّه المستخدمين إلى تحديث بياناتهم ومواقعهم عند الحاجة.',
            'تابع المؤشرات لاكتشاف المشكلات المتكررة وتحسين تجربة الجميع.',
          ],
          closing: 'الإنصاف وسرعة المتابعة يبنيان مجتمعًا أكثر أمانًا.',
        };

  if (
    sessionUser &&
    ![
      'requester',
      'volunteer',
      'ops_admin',
      'verification_admin',
      'super_admin',
      'analytics_viewer',
    ].includes(profile?.role)
  ) {
    return (
      <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center p-4 text-center">
        <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#8A949E]/20 space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-[#B53A3A]" />
          <h2 className="font-bold text-[#1F2430]">الدور غير مكتمل</h2>
          <p className="text-xs text-[#6B7280]">
            حسابك لا يحتوي على دور صالح في جدول profiles.
          </p>
          <button
            onClick={handleSignOut}
            className="text-xs text-[#146B44] font-bold"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shahm-app-shell min-h-screen bg-[#F7F8F9] flex flex-col text-right">
      {configurationNotice}
      {installNotice}

      <header className="shahm-app-header sticky top-0 z-40 border-b border-[#8A949E]/20 bg-white px-4 py-2">
        <div className="mx-auto max-w-2xl space-y-2">
          <div dir="rtl" className="flex min-h-9 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-[#F3F7F4] px-3 py-1.5 text-xs text-[#53645a]">
              <UserRound className="h-4 w-4 shrink-0 text-[#146B44]" aria-hidden="true" />
              <span>أهلاً {profile?.first_name || ''}</span>
              <strong className="text-[#005131]">“{profile?.role === 'volunteer' ? 'Shahm' : profile?.role === 'requester' ? 'Patient' : 'Admin'}”</strong>
            </div>
            <button type="button" onClick={() => void handleAvailabilityToggle()} aria-pressed={isOnline} className={'flex min-h-9 shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ' + (isOnline ? 'bg-[#E6F4ED] text-[#08784B]' : 'bg-[#F1F2F3] text-[#65736A]')}>
              <span className={'h-2.5 w-2.5 rounded-full ' + (isOnline ? 'bg-[#1EAA67]' : 'bg-[#98A19B]')} aria-hidden="true" />
              {isOnline ? 'متصل' : 'غير متصل'}
            </button>
          </div>
          {profileRating && profile && ['requester', 'volunteer'].includes(profile.role) && (
            <div dir="rtl" className="flex justify-start px-3">
              <RatingStars average={profileRating.average_rating} count={profileRating.rating_count} positivePercentage={profileRating.positive_percentage} />
            </div>
          )}
        </div>
      </header>

      <main id="main-content" data-page={isProfilePage ? 'account' : isGuidancePage ? 'guidance' : 'trips'} className={'shahm-app-main flex-1 max-w-2xl w-full mx-auto bg-[#F7F8F9] px-4 pt-0 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-4' + (isProfilePage ? ' is-account-page' : isGuidancePage ? ' is-guidance-page' : '')}>
        <section className="-mx-4 border-b border-[#D8EEE1] bg-[#F0FBF4] px-5 pb-7 pt-6 text-center">
          <div className="shahm-hero-logo mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border-[7px] border-[#DDEFE5] bg-white shadow-sm">
            <img aria-hidden="true" alt="" src="/shahm-logo-mark-20260924.png" className="h-14 w-14 object-contain" />
          </div>
          <p className="text-base font-medium text-[#53645a]">في شهم</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-wide text-[#005131]">الناس للناس</h1>
          <div className="mx-auto mt-4 grid max-w-xs grid-cols-2 gap-8" aria-label="أعداد Shahm وPatient">
            <div>
              <span className="block text-xs font-semibold tracking-wide text-[#65736A]">Shahm</span>
              <strong className="mt-1 block text-2xl font-extrabold tabular-nums text-[#08784B]">{presenceCounts.shahm ?? '—'}</strong>
            </div>
            <div>
              <span className="block text-xs font-semibold tracking-wide text-[#65736A]">Patient</span>
              <strong className="mt-1 block text-2xl font-extrabold tabular-nums text-[#08784B]">{presenceCounts.patient ?? '—'}</strong>
            </div>
          </div>
        </section>

        <blockquote className="rounded-3xl border border-[#D8EEE1] bg-[#E8F7EE] px-5 py-6 text-center text-base font-semibold leading-8 text-[#005131] shadow-sm">
          «من سار بين الناس جابراً للخواطر أدركه الله في جوف المخاطر.»
        </blockquote>
        {isAdmin && (
          <nav aria-label="أقسام الإدارة" className="flex gap-2 overflow-x-auto rounded-2xl border border-[#8A949E]/20 bg-white p-2">
            <button type="button" onClick={() => setAdminTab('trips')} className={`min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold ${adminTab === 'trips' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'}`}>
              المشاوير الميدانية
            </button>
            <button type="button" onClick={() => setAdminTab('safety')} className={`flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold ${adminTab === 'safety' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'}`}>
              <ShieldAlert className="h-3.5 w-3.5" /> البلاغات والسلامة
            </button>
            <button type="button" onClick={() => setAdminTab('analytics')} className={`flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold ${adminTab === 'analytics' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'}`}>
              <LayoutDashboard className="h-3.5 w-3.5" /> المؤشرات والتحليلات
            </button>
            <button type="button" onClick={() => setAdminTab('usage')} className={`flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold ${adminTab === 'usage' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'}`}>
              <Server className="h-3.5 w-3.5" /> استهلاك الخطة المجانية
            </button>
          </nav>
        )}
        {isAdmin && adminTab === 'safety' && <Suspense fallback={<div className="p-4 text-center text-sm">جارٍ التحميل…</div>}><SafetyPanel /></Suspense>}
        {isAdmin && adminTab === 'analytics' && <Suspense fallback={<div className="p-4 text-center text-sm">جارٍ التحميل…</div>}><AnalyticsDashboard /></Suspense>}
        {isAdmin && adminTab === 'usage' && <Suspense fallback={<div className="p-4 text-center text-sm">جارٍ التحميل…</div>}><UsageMonitor /></Suspense>}

        {showRequesterView && (
          <>
            {tripToRate && <TripRatingPrompt trip={tripToRate} role={profile.role} selectedStars={selectedTripStars} onSelect={setSelectedTripStars} selectedWord={selectedTripRatingWord} onSelectWord={setSelectedTripRatingWord} onSubmit={() => void handleRateTrip()} loading={ratingSubmitting} />}
            {canReturnToVolunteer && (
              <button
                type="button"
                onClick={() => void handleReturnToVolunteer()}
                className="min-h-11 rounded-xl border border-[#146B44]/20 bg-white px-4 text-sm font-semibold text-[#146B44]"
              >
                العودة إلى طلبات المساعدة على الطريق
              </button>
            )}

            {reportSuccess && (
              <div className="p-3 bg-[#E6F4ED] text-[#146B44] text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  تم استلام ملاحظتك بسرية تامة وسيتم مراجعتها من قبل المشرفين.
                </span>
              </div>
            )}

            {activeRequesterTrip ? (
              <div className="shahm-trip-card bg-white p-6 rounded-2xl border border-[#8A949E]/20 text-center space-y-4">
                {activeRequesterTrip.status === 'pending' ? (
                  <>
                    <div className="relative mx-auto flex h-44 w-44 items-center justify-center rounded-full">
                      <div className="absolute inset-0 rounded-full border-[10px] border-[#DDEFE5] border-t-[#65E5A0] border-r-[#65E5A0] border-b-[#65E5A0] animate-spin" />
                      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#005131] shadow-lg">
                        <Clock className="h-12 w-12 text-[#91A59B]" aria-hidden="true" />
                      </div>
                    </div>

                    <div className="mx-auto inline-flex max-w-full items-center justify-center gap-2 rounded-full bg-[#BFF5D4] px-4 py-2 text-sm font-semibold text-[#005131]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#58B886] animate-pulse" aria-hidden="true" />
                      <span>أكتر من شهم بيشوفوا طلبك دلوقتي</span>
                    </div>

                    <h3 className="text-lg font-bold text-[#1F2430]">
                      جارٍ البحث عن شهم قريب...
                    </h3>

                    <p className="text-sm leading-6 text-[#53645a]">
                      طلبك ظاهر للشهمين القريبين منك، لحين قبول أحدهم.
                    </p>

                    <div className="rounded-2xl border border-[#146B44]/10 bg-[#F7FBF8] p-4 text-right text-sm space-y-3">
                      <div className="flex items-center justify-between gap-3"><span className="text-[#6B7280]">المريض</span><strong>{patientProfiles.find((patient) => patient.id === activeRequesterTrip.patient_profile_id)?.full_name || 'المريض'}</strong></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-[#6B7280]">من</span><strong>{activeRequesterTrip.origin_area_label}</strong></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-[#6B7280]">إلى</span><strong>{activeRequesterTrip.destination_area_label}</strong></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-[#6B7280]">عدد المرافقين</span><strong>{activeRequesterTrip.people_count}</strong></div>
                      {activeRequesterTrip.request_notes && <div className="border-t border-[#146B44]/10 pt-2"><span className="block text-xs text-[#6B7280]">ملاحظاتك</span><p className="mt-1">{activeRequesterTrip.request_notes}</p></div>}
                    </div>

                    <button
                      onClick={() => { setCancelTripId(activeRequesterTrip.id); setCancelTripError(null); }}
                      className="w-full h-[48px] bg-[#FCEAEA] text-[#B53A3A] font-semibold rounded-xl text-sm hover:bg-[#B53A3A] hover:text-white transition-colors"
                    >
                      إلغاء الطلب
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 mx-auto bg-[#E6F4ED] rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-[#146B44]" />
                    </div>

                    <h3 className="text-lg font-bold text-[#1F2430]">
                      تم قبول طلبك!
                    </h3>

                    <p className="text-xs text-[#6B7280]">
                      شهم قريب وافق على طلب مساعدتك.
                    </p>

                    <div className="p-3 bg-[#F7F8F9] rounded-xl text-xs text-right space-y-1">
                      <div><strong>المريض:</strong> {patientProfiles.find((patient) => patient.id === activeRequesterTrip.patient_profile_id)?.full_name || 'المريض'}</div>
                      <div><strong>من:</strong> {activeRequesterTrip.origin_area_label}</div>
                      <div><strong>إلى:</strong> {activeRequesterTrip.destination_area_label}</div>
                      <div><strong>عدد المرافقين:</strong> {activeRequesterTrip.people_count}</div>
                    </div>

                    {volunteerContactData && (
                      <div className="p-3 bg-[#E6F4ED] rounded-xl text-right space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-[#1F2430]">{volunteerContactData.volunteer_first_name}</span>
                            {volunteerContactData.volunteer_profile_id
                              ? ratingSummaries[volunteerContactData.volunteer_profile_id] && <RatingStars compact average={ratingSummaries[volunteerContactData.volunteer_profile_id].average_rating} count={ratingSummaries[volunteerContactData.volunteer_profile_id].rating_count} positivePercentage={ratingSummaries[volunteerContactData.volunteer_profile_id].positive_percentage} />
                              : <RatingStars compact average={DEFAULT_RATING_SUMMARY.average_rating} count={DEFAULT_RATING_SUMMARY.rating_count} />}
                          </div>
                          <span className="text-[11px] text-[#146B44] font-semibold">
                            {formatTimeSince(volunteerContactData.accepted_at) &&
                              `قبل طلبك ${formatTimeSince(
                                volunteerContactData.accepted_at,
                              )}`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-[#146B44]/10 bg-white/75 p-3 text-xs text-[#3f4942]">
                          <span className="font-semibold text-[#53645a]">رقم الهاتف</span>
                          <span dir="ltr" className="text-left font-semibold">{volunteerContactData.volunteer_phone}</span>
                          <span className="font-semibold text-[#53645a]">نوع السيارة</span>
                          <span>{volunteerContactData.vehicle_type || 'غير متاحة لهذه الرحلة'}</span>
                          <span className="font-semibold text-[#53645a]">لونها</span>
                          <span>{volunteerContactData.vehicle_color || 'غير متاح لهذه الرحلة'}</span>
                          <span className="font-semibold text-[#53645a]">رقم اللوحة</span>
                          <span dir="auto">{volunteerContactData.vehicle_plate_number || 'غير متاح لهذه الرحلة'}</span>
                        </div>

                        <div className="text-xs text-[#146B44] font-semibold flex items-center gap-1 bg-white/70 p-2 rounded-lg border border-[#146B44]/10">
                          <LocateFixed className="w-3.5 h-3.5 shrink-0" />
                          <span>المسافة بينكما وقت قبول الرحلة:</span>
                          <span>
                            {volunteerContactData.distance_km !== null
                              ? formatDistance(volunteerContactData.distance_km)
                              : 'غير متاحة لهذه الرحلة'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <a
                            href={`tel:${volunteerContactData.volunteer_phone}`}
                            className="h-11 bg-[#146B44] text-white rounded-xl flex items-center justify-center gap-1 text-xs font-semibold active:bg-[#0F5636]"
                          >
                            <Phone className="w-4 h-4" />
                            اتصال بالشهم
                          </a>

                          <a
                            href={`https://wa.me/${toWhatsAppNumber(
                              volunteerContactData.volunteer_phone,
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-11 bg-[#1E8E5A] text-white rounded-xl flex items-center justify-center gap-1 text-xs font-semibold active:bg-[#0F5636]"
                          >
                            <MessageSquare className="w-4 h-4" />
                            واتساب
                          </a>
                        </div>
                      </div>
                    )}

                    <button type="button" onClick={() => { setCancelTripId(activeRequesterTrip.id); setCancelTripError(null); }} className="w-full h-[52px] rounded-xl bg-[#FCEAEA] text-base font-semibold text-[#B53A3A]">
                      إلغاء الرحلة
                    </button>

                    <button
                      onClick={() => setReportModalOpen(true)}
                      className="text-xs text-[#6B7280] hover:text-[#B53A3A] flex items-center justify-center gap-1 mx-auto mt-2"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      الإبلاغ عن مشكلة في طلب المساعدة
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="shahm-form-card bg-white p-6 rounded-2xl border border-[#8A949E]/20 space-y-4">
                <h2 className="text-lg font-bold text-[#1F2430]">طلب نقل مريض</h2>

                {errorMessage && (
                  <div className="p-3 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="space-y-2 rounded-xl border border-[#146B44]/15 bg-[#F7FBF8] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="patient-profile" className="text-sm font-semibold text-[#1F2430]">ملف المريض</label>
                    {patientProfiles.length > 0 && (
                      <div className="flex items-center gap-3">
                        {showPatientProfileForm ? (
                          <button type="button" onClick={handleCancelPatientProfileForm} className="text-xs font-bold text-[#146B44]">
                            اختيار مريض مسجل
                          </button>
                        ) : (
                          <>
                            {selectedPatientProfileId && (
                              <button type="button" onClick={handleEditSelectedPatient} className="inline-flex items-center gap-1 text-xs font-bold text-[#146B44]">
                                <Pencil className="h-3.5 w-3.5" /> تعديل بيانات المريض
                              </button>
                            )}
                            <button type="button" onClick={() => { handleCancelPatientProfileForm(); setShowPatientProfileForm(true); }} className="text-xs font-bold text-[#146B44]">
                              إضافة مريض آخر
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {patientProfiles.length > 0 && !showPatientProfileForm && (
                    <select id="patient-profile" value={selectedPatientProfileId} onChange={(event) => setSelectedPatientProfileId(event.target.value)} className="h-12 w-full rounded-xl border border-[#8A949E]/50 bg-white px-3 text-sm">
                      <option value="">اختر المريض</option>
                      {patientProfiles.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.phone_number}</option>)}
                    </select>
                  )}
                  {patientProfiles.length === 0 && <p className="text-xs text-[#6B7280]">أضف بيانات المريض أول مرة للمتابعة. بعد حفظها يمكنك اختيار المريض أو إضافة مريض آخر.</p>}
                  {showPatientProfileForm && (
                    <div className="space-y-3 border-t border-[#146B44]/10 pt-3">
                      <p className="text-xs font-semibold text-[#146B44]">{editingPatientProfileId ? 'تعديل بيانات المريض المحدد' : 'إضافة بيانات مريض'}</p>
                      <input value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="اسم المريض" className="h-12 w-full rounded-xl border border-[#8A949E]/50 bg-white px-3 text-sm" />
                      <input value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} inputMode="tel" placeholder="رقم هاتف المريض" className="h-12 w-full rounded-xl border border-[#8A949E]/50 bg-white px-3 text-sm" />
                      <input value={patientAgeInput} onChange={(event) => setPatientAgeInput(event.target.value)} inputMode="numeric" placeholder="العمر" className="h-12 w-full rounded-xl border border-[#8A949E]/50 bg-white px-3 text-sm" />
                      <textarea value={patientConditionInput} onChange={(event) => setPatientConditionInput(event.target.value)} maxLength={1000} rows={2} placeholder="الحالة الصحية" className="w-full rounded-xl border border-[#8A949E]/50 bg-white px-3 py-2 text-sm" />
                      <button type="button" disabled={savingPatientProfile || !patientName.trim() || !patientPhone.trim()} onClick={() => void handleSavePatientProfile()} className="min-h-11 w-full rounded-xl bg-[#E6F4ED] font-bold text-[#146B44] disabled:opacity-50">
                        {savingPatientProfile ? 'جارٍ حفظ البيانات…' : editingPatientProfileId ? 'حفظ التعديلات' : 'حفظ ملف المريض'}
                      </button>
                      {(patientProfiles.length > 0 || editingPatientProfileId) && (
                        <button type="button" disabled={savingPatientProfile} onClick={handleCancelPatientProfileForm} className="min-h-10 w-full rounded-xl border border-[#146B44]/20 bg-white font-semibold text-[#59636E] disabled:opacity-50">
                          إلغاء
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <label className="block text-sm font-semibold text-[#1F2430]">صلة مقدم الطلب بالمريض
                  <select value={requesterRelation} onChange={(event) => setRequesterRelation(event.target.value as typeof requesterRelation)} className="mt-2 h-12 w-full rounded-xl border border-[#8A949E]/50 bg-white px-3 text-sm">
                    <option value="patient">أنا المريض</option><option value="guardian">ولي أمر أو مسؤول</option><option value="companion">مرافق</option>
                  </select>
                </label>

                <label className="block text-sm font-semibold text-[#1F2430]">عدد الأشخاص
                  <select value={peopleCount} onChange={(event) => setPeopleCount(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#8A949E]/50 bg-white px-3 text-sm">
                    {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>

                <LocationPicker label="مكان التحرك" placeholder="حدد مكان بداية الرحلة" onSelect={setOrigin} allowCurrentLocation />
                <LocationPicker label="الوجهة" placeholder="حدد وجهة المريض" onSelect={setDestination} />

                <label className="block text-sm font-semibold text-[#1F2430]">
                  ملاحظات للمتطوع
                  <textarea
                    maxLength={500}
                    rows={3}
                    value={requestNotes}
                    onChange={(event) => setRequestNotes(event.target.value)}
                    placeholder="معلومة تساعد في تقديم المساعدة"
                    className="mt-2 w-full resize-y rounded-xl border border-[#8A949E] bg-white px-4 py-3 text-sm font-normal"
                  />
                </label>

                <div className="p-3 bg-[#F7F8F9] rounded-xl border border-[#8A949E]/30 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackChecked}
                      onChange={(e) => setAckChecked(e.target.checked)}
                      className="mt-1 accent-[#146B44] w-4 h-4"
                    />
                    <span className="text-xs text-[#1F2430] leading-relaxed">
                      أقر بصحة بيانات طلب نقل المريض وأتحمل مسؤولية دقتها.
                    </span>
                  </label>
                </div>

                <button
                  disabled={
                    !origin || !destination || !selectedPatientProfileId ||
                    !ackChecked ||
                    createTripLoading
                  }
                  onClick={() => void handleCreateTrip()}
                  className="w-full h-[52px] bg-[#146B44] disabled:opacity-40 active:bg-[#0F5636] text-white font-semibold rounded-xl text-base transition-colors flex items-center justify-center gap-2"
                >
                  {createTripLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'طلب نقل الآن'
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {showVolunteerView && (
          <>
            {tripToRate && <TripRatingPrompt trip={tripToRate} role={profile.role} selectedStars={selectedTripStars} onSelect={setSelectedTripStars} selectedWord={selectedTripRatingWord} onSelectWord={setSelectedTripRatingWord} onSubmit={() => void handleRateTrip()} loading={ratingSubmitting} />}
            {raceConditionDetected && (
              <RaceConditionToast
                onClose={() => setRaceConditionDetected(false)}
              />
            )}

            {activeVolunteerTripData ? (
              <div className="shahm-trip-card bg-white p-6 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs bg-[#E6F4ED] text-[#146B44] px-3 py-1 rounded-full font-semibold">
                    تم قبول طلب نقل المريض بنجاح
                  </span>
                  <ShieldCheck className="w-5 h-5 text-[#146B44]" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-[#1F2430]">
                    {activeVolunteerTripData.requester_first_name}
                  </h3>
                  {ratingSummaries[activeVolunteerTripData.requester_profile_id]
                    ? <RatingStars average={ratingSummaries[activeVolunteerTripData.requester_profile_id].average_rating} count={ratingSummaries[activeVolunteerTripData.requester_profile_id].rating_count} positivePercentage={ratingSummaries[activeVolunteerTripData.requester_profile_id].positive_percentage} />
                    : <RatingStars average={DEFAULT_RATING_SUMMARY.average_rating} count={DEFAULT_RATING_SUMMARY.rating_count} />}
                </div>

                <div className="p-3 bg-[#F7F8F9] rounded-xl text-xs space-y-2 text-right">
                  <div className="rounded-xl bg-[#E6F4ED] p-3 font-bold text-[#005131]">نقل مريض</div>
                  <div><strong>المريض:</strong> {activeVolunteerTripData.patient_name} · {activeVolunteerTripData.patient_age ?? 'العمر غير مسجل'} سنة</div>
                  <div><strong>هاتف المريض:</strong> {activeVolunteerTripData.patient_phone}</div>
                  {activeVolunteerTripData.patient_condition && <div><strong>الحالة الصحية:</strong> {activeVolunteerTripData.patient_condition}</div>}
                  {activeVolunteerTripData.request_notes && <div><strong>ملاحظات الرحلة:</strong> {activeVolunteerTripData.request_notes}</div>}

                  <div>
                    <strong>مكان التحرك:</strong>{' '}
                    {activeVolunteerTripData.origin_address}
                  </div>
                  <div><strong>الوجهة:</strong> {activeVolunteerTripData.destination_address}</div>
                  <div><strong>عدد الأشخاص:</strong> {activeVolunteerTripData.people_count}</div>

                  {formatDistance(
                    activeVolunteerTripData.distance_km,
                  ) && (
                    <div>
                      <strong>المسافة من موقعك وقت القبول:</strong>{' '}
                      {formatDistance(
                        activeVolunteerTripData.distance_km,
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={`tel:${activeVolunteerTripData.requester_phone}`}
                    className="h-11 bg-[#146B44] text-white rounded-xl flex items-center justify-center gap-1 text-xs font-semibold active:bg-[#0F5636]"
                  >
                    <Phone className="w-4 h-4" />
                    اتصال
                  </a>

                  <a
                    href={`https://wa.me/${toWhatsAppNumber(
                      activeVolunteerTripData.requester_phone,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-11 bg-[#1E8E5A] text-white rounded-xl flex items-center justify-center gap-1 text-xs font-semibold active:bg-[#0F5636]"
                  >
                    <MessageSquare className="w-4 h-4" />
                    واتساب
                  </a>

                  <a
                    href={`https://maps.google.com/?q=${activeVolunteerTripData.origin_lat},${activeVolunteerTripData.origin_lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-11 bg-[#2F6FED] text-white rounded-xl flex items-center justify-center gap-1 text-xs font-semibold"
                  >
                    <Map className="w-4 h-4" />
                    الخرائط
                  </a>
                </div>

                <button
                  onClick={() =>
                    void handleCompleteTrip(activeVolunteerTripData.trip_id)
                  }
                  className="w-full h-[52px] bg-[#146B44] text-white font-semibold rounded-xl text-base active:bg-[#0F5636] transition-colors"
                >
                  ✓ إنهاء الرحلة
                </button>

                <button
                  onClick={() => {
                    setCancelTripId(activeVolunteerTripData.trip_id);
                    setCancelTripError(null);
                  }}
                  className="w-full h-11 rounded-xl border border-[#B53A3A]/25 bg-[#FCEAEA] text-sm font-semibold text-[#B53A3A]"
                >
                  إلغاء الرحلة
                </button>

                <button
                  onClick={() => setReportModalOpen(true)}
                  className="text-xs text-[#6B7280] hover:text-[#B53A3A] flex items-center justify-center gap-1 mx-auto"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  إبلاغ عن مشكلة
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAcceptedAssistance && (
                  <div className="rounded-2xl border border-[#146B44]/15 bg-white p-5 text-right space-y-3">
                    <div className="flex items-center justify-between"><span className="rounded-full bg-[#E6F4ED] px-3 py-1 text-xs font-bold text-[#146B44]">قبلت طلب مساعدة شهم</span><ShieldCheck className="h-5 w-5 text-[#146B44]" /></div>
                    <h3 className="text-lg font-bold text-[#005131]">{activeAcceptedAssistance.requester_name}</h3>
                    <p className="text-sm">{activeAcceptedAssistance.issue_type} · {activeAcceptedAssistance.location_label}</p>
                    <p className="text-xs text-[#53645a]">{activeAcceptedAssistance.location_address}</p>
                    {activeAcceptedAssistance.notes && <p className="rounded-xl bg-[#F7FBF8] p-3 text-sm">{activeAcceptedAssistance.notes}</p>}
                    <p className="text-sm font-semibold text-[#146B44]">المسافة: {formatDistance(activeAcceptedAssistance.distance_km)}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={`tel:${activeAcceptedAssistance.requester_phone}`} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#146B44] text-xs font-bold text-white"><Phone className="h-4 w-4" /> اتصال</a>
                      <a href={`https://wa.me/${toWhatsAppNumber(activeAcceptedAssistance.requester_phone)}`} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1E8E5A] text-xs font-bold text-white"><MessageSquare className="h-4 w-4" /> واتساب</a>
                    </div>
                    <a href={`https://maps.google.com/?q=${activeAcceptedAssistance.lat},${activeAcceptedAssistance.lng}`} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2F6FED] text-xs font-bold text-white"><Map className="h-4 w-4" /> فتح الموقع</a>
                    <button type="button" onClick={() => void handleCompleteAssistanceRequest(activeAcceptedAssistance.request_id)} className="h-12 w-full rounded-xl bg-[#005131] font-bold text-white">أنهيت المساعدة</button>
                  </div>
                )}

                {activeAssistanceRequest && (
                  <div className="rounded-2xl border border-[#146B44]/15 bg-white p-5 text-right space-y-3">
                    {activeAssistanceRequest.status === 'pending' ? (
                      <>
                        <div className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-full"><div className="absolute inset-0 rounded-full border-[8px] border-[#DDEFE5] border-t-[#65E5A0] animate-spin" /><Clock className="h-9 w-9 text-[#146B44]" /></div>
                        <div className="rounded-full bg-[#BFF5D4] px-3 py-2 text-center text-sm font-bold text-[#005131]">أكتر من شهم بيشوفوا طلبك دلوقتي</div>
                        <h3 className="text-center font-bold">جارٍ البحث عن شهم قريب...</h3>
                        <p className="text-sm">{activeAssistanceRequest.issue_type} · {activeAssistanceRequest.location_label}</p>
                        {activeAssistanceRequest.notes && <p className="rounded-xl bg-[#F7FBF8] p-3 text-sm">{activeAssistanceRequest.notes}</p>}
                        <button type="button" onClick={() => void handleCancelAssistanceRequest()} className="h-11 w-full rounded-xl bg-[#FCEAEA] font-bold text-[#B53A3A]">إلغاء الطلب</button>
                      </>
                    ) : (
                      <>
                        <div className="rounded-full bg-[#E6F4ED] px-3 py-2 text-center text-sm font-bold text-[#146B44]">قبل الشهم طلبك</div>
                        <h3 className="text-lg font-bold">{activeAssistanceRequest.helper_name}</h3>
                        <div className="space-y-2 rounded-xl bg-[#F7FBF8] p-3 text-sm">
                          <p>المسافة: {formatDistance(activeAssistanceRequest.accepted_distance_km)}</p>
                          <p>السيارة: {activeAssistanceRequest.vehicle_type} · {activeAssistanceRequest.vehicle_color}</p>
                          <p>رقم اللوحة: {activeAssistanceRequest.vehicle_plate_number}</p>
                        </div>
                        {activeAssistanceRequest.helper_phone && <div className="grid grid-cols-2 gap-2">
                          <a href={`tel:${activeAssistanceRequest.helper_phone}`} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#146B44] text-xs font-bold text-white"><Phone className="h-4 w-4" /> اتصال</a>
                          <a href={`https://wa.me/${toWhatsAppNumber(activeAssistanceRequest.helper_phone)}`} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1E8E5A] text-xs font-bold text-white"><MessageSquare className="h-4 w-4" /> واتساب</a>
                        </div>}
                        <button type="button" onClick={() => void handleCompleteAssistanceRequest(activeAssistanceRequest.request_id)} className="h-12 w-full rounded-xl bg-[#005131] font-bold text-white">اكتملت المساعدة</button>
                      </>
                    )}
                  </div>
                )}

                {showAssistanceForm && !activeAssistanceRequest && (
                  <div className="rounded-2xl border border-[#146B44]/15 bg-white p-5 text-right space-y-4">
                    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">طلب مساعدة على الطريق</h2><button type="button" onClick={() => setShowAssistanceForm(false)} aria-label="إغلاق"><X className="h-5 w-5" /></button></div>
                    {errorMessage && <p role="alert" className="rounded-xl bg-[#FCEAEA] p-3 text-sm text-[#B53A3A]">{errorMessage}</p>}
                    <label className="block text-sm font-semibold">نوع المشكلة
                      <select value={assistanceIssueType} onChange={(event) => setAssistanceIssueType(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#8A949E]/50 bg-white px-3 text-sm"><option value="">اختر نوع المشكلة</option>{ROAD_PROBLEM_TYPES.map((issue) => <option key={issue} value={issue}>{issue}</option>)}</select>
                    </label>
                    <label className="block text-sm font-semibold">الملاحظات
                      <textarea value={assistanceNotes} onChange={(event) => setAssistanceNotes(event.target.value)} maxLength={500} rows={3} placeholder="اكتب تفاصيل تساعد الشهم على فهم المشكلة" className="mt-2 w-full rounded-xl border border-[#8A949E]/50 bg-white p-3 text-sm" />
                    </label>
                    <LocationPicker label="عطلان فين؟" placeholder="حدد موقع العطل" onSelect={setAssistanceLocation} allowCurrentLocation />
                    <label className="flex items-start gap-2 rounded-xl bg-[#F7F8F9] p-3 text-xs"><input type="checkbox" checked={ackChecked} onChange={(event) => setAckChecked(event.target.checked)} className="mt-1 accent-[#146B44]" /><span>أقر بصحة بيانات الطلب وموقعي الحالي.</span></label>
                    <button type="button" disabled={!assistanceLocation || !assistanceIssueType || !ackChecked || creatingAssistanceRequest} onClick={() => void handleCreateAssistanceRequest()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#146B44] font-bold text-white disabled:opacity-50">{creatingAssistanceRequest ? <Loader2 className="h-5 w-5 animate-spin" /> : 'إرسال طلب المساعدة'}</button>
                  </div>
                )}

                {!activeAssistanceRequest && !showAssistanceForm && (
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => void handleOpenHelpRequest()} className="flex h-16 min-w-0 items-center justify-center gap-2 rounded-2xl border border-[#D8EEE1] bg-[#E8F7EE] px-2 text-center text-sm font-extrabold text-[#005131] shadow-sm transition-colors hover:bg-[#E0F4E8]">
                      <HeartHandshake className="h-5 w-5 shrink-0" aria-hidden="true" /><span>طلب مساعدة</span>
                    </button>
                    <button type="button" onClick={() => setShowRouteDestinationModal(true)} className="flex h-16 min-w-0 items-center justify-center gap-2 rounded-2xl border border-[#D8EEE1] bg-[#E8F7EE] px-2 text-center text-sm font-extrabold text-[#005131] shadow-sm transition-colors hover:bg-[#E0F4E8]">
                      <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" /><span>حدد وجهتك</span>
                    </button>
                  </div>
                )}
                {(activeAssistanceRequest || showAssistanceForm) && <button type="button" onClick={() => setShowRouteDestinationModal(true)} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#D8EEE1] bg-[#E8F7EE] text-sm font-extrabold text-[#005131]"><MapPin className="h-5 w-5" />حدد وجهتك</button>}

                <h2 className="flex items-center justify-between gap-2 text-base font-bold text-[#1F2430]">
                  <span>طلبات نقل المرضى القريبة</span>
                  <span className="text-xs font-normal text-[#6B7280]">({pendingTrips.length})</span>
                </h2>

                {loadingNearbyTrips ? (
                  <div className="bg-white p-8 rounded-2xl border border-[#8A949E]/20 text-center">
                    <Loader2 className="w-8 h-8 text-[#146B44] mx-auto animate-spin" />
                    <p className="text-xs text-[#6B7280] mt-3">
                      بنبحث عن طلبات نقل المرضى القريبة...
                    </p>
                  </div>
                ) : !volunteerLocation ? (
                  <div className="bg-white p-8 rounded-2xl border border-[#8A949E]/20 text-center space-y-2">
                    <LocateFixed className="w-8 h-8 text-[#8A949E] mx-auto" />
                    <p className="text-sm font-semibold text-[#1F2430]">
                      حدد موقعك أولًا
                    </p>
                    <p className="text-xs text-[#6B7280]">
                      لن يتم عرض الطلبات إلا بعد تحديد موقعك.
                    </p>
                  </div>
                ) : pendingTrips.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-[#8A949E]/20 text-center space-y-2">
                    <Clock className="w-8 h-8 text-[#8A949E] mx-auto" />
                    <p className="text-sm font-semibold text-[#1F2430]">
                      لا توجد طلبات نقل قريبة الآن
                    </p>
                  </div>
                ) : (
                  pendingTrips.map((trip) => (
                    <div
                      key={trip.id}
                      onClick={() => void openTripDetails(trip)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openTripDetails(trip); } }}
                      role="button"
                      tabIndex={0}
                      aria-label={`عرض تفاصيل طلب نقل من ${trip.origin_area_label} إلى ${trip.destination_area_label}`}
                      className="shahm-request-card bg-[#FFFFFF] p-4 rounded-2xl border border-[#8A949E]/20 shadow-sm cursor-pointer hover:border-[#146B44] transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs text-[#6B7280]">
                        <span className="rounded-full bg-[#E6F4ED] px-3 py-1 font-bold text-[#005131]">نقل مريض</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-[#146B44]/10 pb-2 text-right">
                        <strong className="text-sm text-[#172B21]">{trip.requester_first_name || 'مقدم الطلب'}</strong>
                        {ratingSummaries[trip.requester_id]
                          ? <RatingStars average={ratingSummaries[trip.requester_id].average_rating} count={ratingSummaries[trip.requester_id].rating_count} positivePercentage={ratingSummaries[trip.requester_id].positive_percentage} compact />
                          : <RatingStars average={DEFAULT_RATING_SUMMARY.average_rating} count={DEFAULT_RATING_SUMMARY.rating_count} compact />}
                      </div>

                      <div dir="rtl" className="space-y-2 text-sm text-[#172B21]">
                        <div className="flex items-center gap-2.5 rounded-xl border border-[#146B44]/10 bg-[#E6F4ED]/55 px-2.5 py-2 backdrop-blur-sm">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/90 text-[#08784B] shadow-sm" aria-hidden="true">
                            <MapPin className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 leading-6"><span className="block text-[10px] font-semibold text-[#65736A]">نقطة الانطلاق</span><strong className="font-bold text-[#172B21]">{trip.origin_area_label}</strong></span>
                        </div>
                        <div className="mr-6 h-2 border-r-2 border-dashed border-[#70BD91]" aria-hidden="true" />
                        <div className="flex items-center gap-2.5 rounded-xl border border-[#146B44]/10 bg-[#E6F4ED]/55 px-2.5 py-2 backdrop-blur-sm">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/90 text-[#08784B] shadow-sm" aria-hidden="true">
                            <LocateFixed className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 leading-6"><span className="block text-[10px] font-semibold text-[#65736A]">الوجهة</span><strong className="font-bold text-[#172B21]">{trip.destination_area_label}</strong></span>
                        </div>
                      </div>

                      {trip.request_notes && <p className="rounded-lg bg-[#F7FBF8] px-3 py-2 text-xs leading-5 text-[#53645a]">{trip.request_notes}</p>}

                      {formatDistance(trip.distance_km) && (
                        <div className="text-xs text-[#146B44] font-semibold flex items-center gap-1">
                          <LocateFixed className="w-3.5 h-3.5" />
                          {formatDistance(trip.distance_km)} منك
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {!activeVolunteerTripData && (
              <section className="space-y-3" aria-label="شهم آخر يحتاج مساعدة">
                <h2 className="flex items-center justify-between text-base font-bold text-[#1F2430]">
                  <span>شهم آخر يحتاج مساعدة</span>
                  <span className="text-xs font-normal text-[#6B7280]">({nearbyAssistanceRequests.length})</span>
                </h2>
                {nearbyAssistanceRequests.length === 0 ? (
                  <div className="rounded-2xl border border-[#8A949E]/20 bg-white p-5 text-center text-sm text-[#6B7280]">لا توجد طلبات مساعدة قريبة الآن</div>
                ) : nearbyAssistanceRequests.map((request) => (
                  <article key={request.id} className="space-y-3 rounded-2xl border border-[#8A949E]/20 bg-white p-4">
                    <div className="flex items-center justify-between"><span className="rounded-full bg-[#E6F4ED] px-3 py-1 text-xs font-bold text-[#005131]">{request.issue_type}</span><span className="text-xs font-semibold text-[#146B44]">{formatDistance(request.distance_km)} منك</span></div>
                    <p className="text-sm font-bold">عطلان فين؟ {request.location_label}</p>
                    {request.notes && <p className="rounded-xl bg-[#F7FBF8] p-3 text-sm text-[#53645a]">{request.notes}</p>}
                    <button type="button" disabled={acceptingTripId === request.id} onClick={() => void handleAcceptAssistanceRequest(request.id)} className="shahm-accept-pulse flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#146B44] text-sm font-bold text-white disabled:animate-none disabled:opacity-60">{acceptingTripId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> قبول طلب المساعدة</>}</button>
                  </article>
                ))}
              </section>
            )}

            {selectedTripDetails && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 animate-fade-in"
                onClick={(event) => { if (event.target === event.currentTarget) setSelectedTripDetails(null); }}
                role="dialog"
                aria-modal="true"
                aria-label="تفاصيل طلب نقل مريض"
              >
                <section dir="rtl" className="w-full max-w-sm max-h-[82vh] overflow-y-auto rounded-3xl border border-[#146B44]/10 bg-white p-5 text-right shadow-2xl space-y-4 animate-request-card-enter">
                  <div className="flex items-center justify-between border-b border-[#146B44]/10 pb-3">
                    <div>
                      <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#E6F4ED] px-2.5 py-1 text-[11px] font-bold text-[#146B44]"><HeartHandshake className="h-3.5 w-3.5" /> فرصة لمساعدة مريض</span>
                      <h3 className="text-base font-bold text-[#1F2430]">
                      تفاصيل طلب نقل مريض
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTripDetails(null)}
                      aria-label="إغلاق تفاصيل الطلب"
                      className="grid h-9 w-9 place-items-center rounded-full bg-[#F3F7F4] text-[#6B7280]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-2.5 rounded-2xl border border-[#D8EEE1] bg-[#F3FBF6] p-3.5 text-sm text-[#1F2430]">
                    <div className="rounded-xl border border-[#146B44]/10 bg-white p-3">
                      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold text-[#65736A]"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#E6F4ED] text-[#08784B]">١</span><MapPin className="h-3.5 w-3.5 text-[#08784B]" />موقع التحرك</div>
                      <strong className="block pr-8 text-sm leading-6 text-[#172B21]">{selectedTripAddresses?.origin_address || selectedTripDetails.origin_area_label}</strong>
                    </div>
                    <div className="mr-6 h-3 border-r-2 border-dashed border-[#70BD91]" aria-hidden="true" />
                    <div className="rounded-xl border border-[#08784B]/20 bg-[#E8F7EE] p-3">
                      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold text-[#08784B]"><span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[#08784B]">٢</span><LocateFixed className="h-3.5 w-3.5" />وجهة المريض</div>
                      <strong className="block pr-8 text-sm leading-6 text-[#005131]">{selectedTripAddresses?.destination_address || selectedTripDetails.destination_area_label}</strong>
                    </div>
                    <div className="flex items-center gap-3 border-t border-[#146B44]/10 pt-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#146B44] shadow-sm"><UserRound className="h-4 w-4" /></span>
                      <div><span className="block text-[11px] font-medium text-[#6B7280]">صلة مقدم الطلب</span><strong>{selectedTripDetails.requester_relation === 'patient' ? 'المريض نفسه' : selectedTripDetails.requester_relation === 'guardian' ? 'ولي أمر أو مسؤول' : 'مرافق'}</strong></div>
                    </div>
                    <div className="flex items-center gap-3 border-t border-[#146B44]/10 pt-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#146B44] shadow-sm"><HeartHandshake className="h-4 w-4" /></span>
                      <div><span className="block text-[11px] font-medium text-[#6B7280]">عدد المستفيدين</span><strong>{selectedTripDetails.people_count}</strong></div>
                    </div>
                    {selectedTripDetails.request_notes && (
                      <div className="flex items-start gap-3 border-t border-[#146B44]/10 pt-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#146B44] shadow-sm"><MessageSquare className="h-4 w-4" /></span>
                        <div><span className="block text-[11px] font-medium text-[#6B7280]">ملاحظات</span><strong className="font-medium leading-6">{selectedTripDetails.request_notes}</strong></div>
                      </div>
                    )}
                  </div>

                  {tripDetailsLoading && <div className="flex items-center justify-center gap-2 text-xs text-[#6B7280]"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تحميل تفاصيل العنوان...</div>}
                  {errorMessage && <p role="alert" className="rounded-xl bg-[#FCEAEA] p-3 text-xs text-[#B53A3A]">{errorMessage}</p>}

                  <button
                    type="button"
                    disabled={acceptingTripId === selectedTripDetails.id || tripDetailsLoading}
                    onClick={() => void handleAcceptTrip(selectedTripDetails.id)}
                    className="shahm-accept-pulse flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#08784B] text-sm font-bold text-white shadow-md shadow-[#08784B]/20 active:bg-[#0F5636] disabled:animate-none disabled:opacity-60"
                  >
                    {acceptingTripId === selectedTripDetails.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <><CheckCircle2 className="h-5 w-5" /> أقبل مساعدة المريض</>
                    )}
                  </button>
                  <p className="text-center text-[11px] leading-5 text-[#65736A]">بقبولك للطلب، هتكون سببًا في تخفيف مشوار مريض محتاج للمساعدة.</p>
                </section>
              </div>
            )}
          </>
        )}

        {showRouteDestinationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10251b]/55 p-4 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) setShowRouteDestinationModal(false); }} role="dialog" aria-modal="true" aria-labelledby="route-destination-title">
            <section className="w-full max-w-md space-y-4 rounded-3xl border border-[#146B44]/10 bg-white p-5 text-right shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#146B44]/10 pb-3">
                <div><span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#E6F4ED] px-2.5 py-1 text-[11px] font-bold text-[#146B44]"><MapPin className="h-3.5 w-3.5" />تفضيل المشاوير</span><h2 id="route-destination-title" className="text-lg font-bold text-[#1F2430]">حدد وجهتك</h2></div>
                <button type="button" onClick={() => setShowRouteDestinationModal(false)} aria-label="إغلاق" className="grid h-10 w-10 place-items-center rounded-full bg-[#F3F7F4] text-[#6B7280]"><X className="h-5 w-5" /></button>
              </div>
              <p className="text-sm leading-6 text-[#53645a]">اختر وجهتك، وسنرتب لك المشاوير القريبة الواقعة في اتجاهها.</p>
              {routeDestination && <div className="flex items-center gap-2 rounded-xl bg-[#E8F7EE] p-3 text-sm font-semibold text-[#08784B]"><MapPin className="h-4 w-4 shrink-0" />وجهتك الحالية: {routeDestination.areaLabel}</div>}
              <LocationPicker label="وجهتك" placeholder="ابحث عن وجهتك" onSelect={(value) => { setRouteDestination(value); setRouteFilterEnabled(true); setRoutePreferenceMessage(''); }} />
              {routePreferenceMessage && <p role="status" className="rounded-xl bg-[#FCEAEA] p-3 text-xs text-[#B53A3A]">{routePreferenceMessage}</p>}
              <button type="button" disabled={routePreferenceSaving || !routeDestination} onClick={() => void (async () => { const saved = await saveVolunteerRoutePreference(true); if (saved) setShowRouteDestinationModal(false); })()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#146B44] text-sm font-bold text-white shadow-md shadow-[#146B44]/20 disabled:opacity-50">{routePreferenceSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle2 className="h-5 w-5" />حفظ الوجهة</>}</button>
              {routeFilterEnabled && <button type="button" disabled={routePreferenceSaving} onClick={() => void (async () => { const saved = await saveVolunteerRoutePreference(false); if (saved) setShowRouteDestinationModal(false); })()} className="h-10 w-full rounded-xl border border-[#8A949E]/25 text-sm font-semibold text-[#6B7280]">عرض كل المشاوير بدون فلترة</button>}
            </section>
          </div>
        )}

        {showSettings && (
          <section className="account-page-content mx-auto w-full max-w-2xl space-y-5 rounded-3xl border border-[#146B44]/10 bg-white p-4 text-right shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3 border-b border-[#8A949E]/15 pb-4">
                <div><h2 className="text-xl font-extrabold text-[#005131]">حسابي</h2><p className="mt-1 text-sm text-[#6B7280]">بياناتك وتفضيلاتك في مكان واحد.</p></div>
                <button
                  onClick={handleCloseSettings}
                  className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-[#F3F7F4] px-3 text-xs font-semibold text-[#53645a] hover:text-[#1F2430]"
                >
                  <ArrowRight className="h-4 w-4" /> رجوع للمشاوير
                </button>
              </div>

              {settingsError && (
                <div className="p-3 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{settingsError}</span>
                </div>
              )}

              {settingsSuccess && (
                <div className="p-3 bg-[#E6F4ED] text-[#146B44] text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>تم حفظ البيانات بنجاح.</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2430] mb-1">
                    الاسم الأول
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsFirstName}
                    onChange={(e) => setSettingsFirstName(e.target.value)}
                    className="w-full h-11 px-3 bg-[#FFFFFF] border border-[#8A949E] rounded-xl text-sm text-[#1F2430] focus:border-[#2F6FED] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F2430] mb-1">
                    رقم الجوال
                  </label>
                  <input
                    type="tel"
                    required
                    value={settingsPhone}
                    onChange={(e) => setSettingsPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full h-11 px-3 bg-[#FFFFFF] border border-[#8A949E] rounded-xl text-sm text-[#1F2430] focus:border-[#2F6FED] focus:outline-none"
                  />
                </div>

                {profile?.role === 'volunteer' && (
                  <div className="space-y-2 rounded-xl border border-[#146B44]/15 bg-[#F7FBF8] p-3 text-xs">
                    <h4 className="font-bold text-[#005131]">بيانات السيارة المسجلة</h4>
                    <div className="flex justify-between gap-3"><span>النوع والموديل</span><strong>{profile.vehicle_type}</strong></div>
                    <div className="flex justify-between gap-3"><span>اللون</span><strong>{profile.vehicle_color}</strong></div>
                    <div className="flex justify-between gap-3"><span>رقم اللوحة</span><strong dir="auto">{profile.vehicle_plate_number}</strong></div>
                    <p className="leading-5 text-[#6B7280]">بيانات السيارة ثابتة بعد التسجيل ولا يمكن تعديلها.</p>
                  </div>
                )}

                <div className="pt-2 border-t border-[#8A949E]/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#1F2430]">
                      الإشعارات الفورية
                    </span>
                    <span className="text-[#6B7280]">
                      {pushEnabled ? 'مفعلة ✓' : 'غير مفعلة'}
                    </span>
                  </div>

                  {!pushEnabled && (
                    <button
                      type="button"
                      onClick={() => void handleEnablePushNotifications()}
                      disabled={pushLoading}
                      className="w-full h-10 bg-[#E6F4ED] text-[#146B44] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                    >
                      {pushLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <BellRing className="w-4 h-4" />
                      )}
                      تفعيل الإشعارات
                    </button>
                  )}
                  {pushError && <p role="alert" className="rounded-xl bg-[#FCEAEA] p-3 text-xs text-[#B53A3A]">{pushError}</p>}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={settingsSaving}
                  onClick={() => void handleSaveSettings()}
                  className="flex-1 h-11 bg-[#146B44] text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
                >
                  {settingsSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'حفظ التغييرات'
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCloseSettings}
                  className="px-4 h-11 border border-[#8A949E] text-[#6B7280] text-sm font-semibold rounded-xl"
                >
                  رجوع
                </button>
              </div>
              <button type="button" onClick={() => void handleSignOut()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#B53A3A]/20 bg-[#FCEAEA] text-sm font-bold text-[#B53A3A]">تسجيل الخروج</button>
          </section>
        )}

        {cancelTripId && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={(event) => { if (event.target === event.currentTarget && !cancelTripSubmitting) setCancelTripId(null); }} role="dialog" aria-modal="true" aria-labelledby="cancel-trip-title">
            <section dir="rtl" className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 text-right shadow-2xl">
              <div className="flex items-center justify-between"><h2 id="cancel-trip-title" className="text-lg font-bold text-[#1F2430]">إلغاء الرحلة</h2><button type="button" onClick={() => setCancelTripId(null)} disabled={cancelTripSubmitting} aria-label="إغلاق" className="grid h-10 w-10 place-items-center rounded-full text-[#6B7280] hover:bg-[#F7F8F9]"><X className="h-5 w-5" /></button></div>
              <p className="text-sm leading-6 text-[#53645a]">اختر سبب الإلغاء. سيُحفظ السبب مع الرحلة لمراجعته عند الحاجة.</p>
              <label className="block text-sm font-semibold text-[#1F2430]">سبب الإلغاء
                <select value={cancelTripReason} onChange={(event) => { setCancelTripReason(event.target.value); setCancelTripError(null); }} className="mt-2 h-12 w-full rounded-xl border border-[#8A949E]/50 bg-white px-3 text-sm">
                  <option value="">اختر السبب</option>
                  {profile?.role === 'volunteer' ? <>
                    <option value="ظرف طارئ منعني من إكمال الرحلة">ظرف طارئ</option>
                    <option value="تعذر إكمال الرحلة">تعذر إكمال الرحلة</option>
                    <option value="تغيرت ظروف الطريق أو الوجهة">تغيرت ظروف الطريق أو الوجهة</option>
                    <option value="مشكلة تتعلق بالسلامة">مشكلة تتعلق بالسلامة</option>
                  </> : <>
                    <option value="لم أعد بحاجة إلى النقل">لم أعد بحاجة إلى النقل</option>
                    <option value="وجدت وسيلة نقل أخرى">وجدت وسيلة نقل أخرى</option>
                    <option value="تغيرت حالة المريض">تغيرت حالة المريض</option>
                    <option value="بيانات الرحلة غير صحيحة">بيانات الرحلة غير صحيحة</option>
                  </>}
                  <option value="other">سبب آخر</option>
                </select>
              </label>
              {cancelTripReason === 'other' && <label className="block text-sm font-semibold text-[#1F2430]">اكتب السبب<textarea value={cancelTripDetails} onChange={(event) => setCancelTripDetails(event.target.value)} rows={3} maxLength={500} className="mt-2 w-full rounded-xl border border-[#8A949E]/50 bg-white p-3 text-sm" /></label>}
              {cancelTripError && <p role="alert" className="rounded-xl bg-[#FCEAEA] p-3 text-xs text-[#B53A3A]">{cancelTripError}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCancelTripId(null)} disabled={cancelTripSubmitting} className="h-11 rounded-xl border border-[#8A949E]/40 text-sm font-semibold text-[#53645a]">رجوع</button>
                <button type="button" onClick={() => void handleCancelTrip(cancelTripId)} disabled={cancelTripSubmitting || !cancelTripReason || (cancelTripReason === 'other' && cancelTripDetails.trim().length < 5)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#B53A3A] text-sm font-bold text-white disabled:opacity-50">{cancelTripSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تأكيد الإلغاء'}</button>
              </div>
            </section>
          </div>
        )}

        {reportModalOpen && activeRequesterTrip && (
          <ReportModal
            isOpen={reportModalOpen}
            tripId={activeRequesterTrip.id}
            reportedProfileId={activeRequesterTrip.volunteer_id}
            reporterProfileId={profile!.id}
            reporterRole="requester"
            onClose={() => setReportModalOpen(false)}
            onSuccess={() => {
              setReportModalOpen(false);
              setReportSuccess(true);
            }}
          />
        )}

        {reportModalOpen && activeVolunteerTripData && (
          <ReportModal
            isOpen={reportModalOpen}
            tripId={activeVolunteerTripData.trip_id}
            reportedProfileId={activeVolunteerTripData.requester_profile_id}
            reporterProfileId={profile!.id}
            reporterRole="volunteer"
            onClose={() => setReportModalOpen(false)}
            onSuccess={() => {
              setReportModalOpen(false);
              setReportSuccess(true);
            }}
          />
        )}

        {showGuidance && (
          <section className="guidance-page-content mx-auto w-full max-w-2xl space-y-5 rounded-3xl border border-[#146B44]/10 bg-white p-4 text-right shadow-sm sm:p-6" aria-labelledby="guidance-title">
            <div className="flex items-center justify-between gap-3 border-b border-[#8A949E]/15 pb-4">
              <div><h2 id="guidance-title" className="text-xl font-extrabold text-[#005131]">{guidanceContent.title}</h2><p className="mt-1 text-sm leading-6 text-[#6B7280]">{guidanceContent.intro}</p></div>
              <button type="button" onClick={() => { setShowGuidance(false); setActiveBottomTab('trips'); }} aria-label="العودة للمشاوير" className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-[#F3F7F4] px-3 text-xs font-semibold text-[#53645a]"><ArrowRight className="h-4 w-4" /> رجوع</button>
            </div>
            <ol className="space-y-3">
              {guidanceContent.items.map((item, index) => (
                <li key={item} className="flex items-start gap-3 rounded-2xl border border-[#146B44]/8 bg-[#F7FBF8] p-3 text-sm leading-6 text-[#3f4942]">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#DDF3E5] text-xs font-extrabold text-[#08784B]">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
            <p className="rounded-2xl bg-[#E6F4ED] p-4 text-center text-sm font-semibold leading-6 text-[#146B44]">{guidanceContent.closing}</p>
            <button type="button" onClick={() => { setShowGuidance(false); setActiveBottomTab('trips'); }} className="min-h-12 w-full rounded-xl bg-[#146B44] font-bold text-white">العودة للمشاوير</button>
          </section>
        )}
      </main>

      <nav aria-label="التنقل الرئيسي" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#146B44]/10 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(16,37,27,0.08)]">
        <div className="mx-auto grid max-w-2xl grid-cols-3">
          <button type="button" onClick={() => { setActiveBottomTab('account'); setShowGuidance(false); handleOpenSettings(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={'flex min-h-[68px] flex-col items-center justify-center gap-1 border-l border-[#146B44]/10 text-xs ' + (activeBottomTab === 'account' ? 'bg-[#E6F4ED] font-bold text-[#005131]' : 'text-[#53645a]')}>
            <UserRound className="h-5 w-5" aria-hidden="true" />
            <span>حسابي</span>
          </button>
          <button type="button" onClick={() => { setActiveBottomTab('guidance'); setShowSettings(false); setShowGuidance(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={'flex min-h-[68px] flex-col items-center justify-center gap-1 border-l border-[#146B44]/10 text-xs ' + (activeBottomTab === 'guidance' ? 'bg-[#E6F4ED] font-bold text-[#005131]' : 'text-[#53645a]')}>
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            <span>الإرشادات</span>
          </button>
          <button type="button" onClick={() => { setActiveBottomTab('trips'); setShowSettings(false); setShowGuidance(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={'flex min-h-[68px] flex-col items-center justify-center gap-1 text-xs ' + (activeBottomTab === 'trips' ? 'bg-[#E6F4ED] font-bold text-[#005131]' : 'text-[#53645a]')}>
            <CarFront className="h-5 w-5" aria-hidden="true" />
            <span>المشاوير</span>
          </button>
        </div>
      </nav>

    </div>
  );
};

export default App;




