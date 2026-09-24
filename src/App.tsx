import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  hasSupabaseConfig,
  supabase,
  supabaseUrl,
  UserRole,
  PublicTrip,
  ContactCardData,
  RequesterRelation,
  VolunteerContactData,
} from './lib/supabase';
import { reportVolunteerLocation } from './lib/volunteerLocation';
import { LocationPicker } from './components/common/LocationPicker';
import { ReportModal } from './components/common/ReportModal';
import { RaceConditionToast } from './components/common/StateViews';
import { SafetyPanel } from './components/admin/SafetyPanel';
import { AnalyticsDashboard } from './components/admin/AnalyticsDashboard';
import { UsageMonitor } from './components/admin/UsageMonitor';
import { toWhatsAppNumber } from './lib/phone';
import { useInstallPrompt } from './lib/useInstallPrompt';
import { registerPushNotifications } from './lib/push';
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
  RefreshCw,
  Bell,
  BellRing,
  UserRound,
  BookOpen,
  CarFront,
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

const TRIP_PUBLIC_COLUMNS =
  'id, requester_id, volunteer_id, origin_area_label, destination_area_label, status, requester_relation, scheduled_at, created_at, accepted_at, completed_at, problem_type, people_count, request_notes';

const ROAD_PROBLEM_TYPES = [
  'عطل ميكانيكي',
  'إطار مثقوب',
  'نفاد الوقود',
  'بطارية السيارة',
  'مشكلة كهربائية',
  'حادث أو طارئ',
  'أخرى',
] as const;

const getDateTimeInputLimits = () => {
  const now = new Date();
  const minDate = new Date(now.getTime() + 5 * 60 * 1000);
  const maxDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const toLocalInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return {
    min: toLocalInput(minDate),
    max: toLocalInput(maxDate),
  };
};

const formatScheduledAt = (value?: string | null) => {
  if (!value) return 'غير محدد';
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'غير محدد';
  }

  return date.toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatDistance = (distance?: number | null) => {
  if (distance === null || distance === undefined) return null;
  if (!Number.isFinite(Number(distance))) return null;

  const numericDistance = Number(distance);
  if (numericDistance < 1) {
    return `${Math.round(numericDistance * 1000)} متر`;
  }

  return `${numericDistance.toFixed(1)} كم`;
};

const formatTimeSince = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) return 'الآن';
  if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;

  const diffDays = Math.round(diffHours / 24);
  return `منذ ${diffDays} يوم`;
};

const hasCompleteVolunteerVehicleDetails = (candidate: any) =>
  typeof candidate?.vehicle_type === 'string' && candidate.vehicle_type.trim().length >= 2 &&
  typeof candidate?.vehicle_color === 'string' && candidate.vehicle_color.trim().length >= 2 &&
  typeof candidate?.vehicle_plate_number === 'string' && candidate.vehicle_plate_number.trim().length >= 3 &&
  candidate?.vehicle_data_responsibility_ack === true;

const installDismissedStorageKey = 'shahm.install-dismissed.v1';
const readBooleanPreference = (key: string) => {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};
const writeBooleanPreference = (key: string) => {
  try {
    window.localStorage.setItem(key, 'true');
  } catch {
    // The UI continues to work for browsers that block local storage.
  }
};

export const App: React.FC = () => {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(null);

  const [adminTab, setAdminTab] = useState<
    'trips' | 'safety' | 'analytics' | 'usage'
  >('trips');

  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientCondition, setPatientCondition] = useState('');

  const [vehicleType, setVehicleType] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');
  const [vehicleDetailsConfirmed, setVehicleDetailsConfirmed] = useState(false);
  const [vehicleProfileSaving, setVehicleProfileSaving] = useState(false);
  const [vehicleProfileError, setVehicleProfileError] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(false);
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

  const [dest, setDest] = useState<{
    areaLabel: string;
    fullAddress: string;
    lat: number;
    lng: number;
  } | null>(null);

  const [relation, setRelation] = useState<RequesterRelation>('patient');
  const [problemType, setProblemType] = useState<string>('');
  const [peopleCount, setPeopleCount] = useState('1');
  const [requestNotes, setRequestNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [ackChecked, setAckChecked] = useState(false);
  const [createTripLoading, setCreateTripLoading] = useState(false);

  const [activeRequesterTrip, setActiveRequesterTrip] =
    useState<PublicTrip | null>(null);

  const [pendingTrips, setPendingTrips] = useState<PublicTrip[]>([]);

  const [activeVolunteerTripData, setActiveVolunteerTripData] =
    useState<ContactCardData | null>(null);

  const [selectedTripDetails, setSelectedTripDetails] =
    useState<PublicTrip | null>(null);

  const [acceptingTripId, setAcceptingTripId] = useState<string | null>(null);
  const [raceConditionDetected, setRaceConditionDetected] = useState(false);

  const [volunteerLocation, setVolunteerLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [pushLoading, setPushLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const [volunteerContactData, setVolunteerContactData] =
    useState<VolunteerContactData | null>(null);

  const [showSettings, setShowSettings] = useState(false);
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

  const dateTimeLimits = useMemo(() => getDateTimeInputLimits(), []);

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
      await supabase.auth.signOut();
    } finally {
      activeUserId.current = null;
      supabase.removeAllChannels();
      localStorage.removeItem('shahm.pendingProfile');

      setSessionUser(null);
      setProfile(null);
      setRoleSelection(null);

      setFirstName('');
      setPhone('');
      setPatientAge('');
      setPatientCondition('');

      setAuthLoading(false);
      setErrorMessage(null);
      setProfileError(null);

      setPendingTrips([]);
      setActiveRequesterTrip(null);
      setActiveVolunteerTripData(null);
      setSelectedTripDetails(null);

      setAcceptingTripId(null);
      setRaceConditionDetected(false);

      setVolunteerLocation(null);
      setLocationError(null);

      setScheduledAt('');
      setProblemType('');
      setPeopleCount('1');
      setRequestNotes('');
      setOrigin(null);
      setDest(null);
      setAckChecked(false);

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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (error) throw error;
      if (activeUserId.current !== uid) return;

      if (!data) {
        const pendingProfile = JSON.parse(
          localStorage.getItem('shahm.pendingProfile') || 'null',
        );

        if (
          pendingProfile?.firstName &&
          pendingProfile?.phone &&
          pendingProfile?.role
        ) {
          const isVolunteer = pendingProfile.role === 'volunteer';

          if (isVolunteer && !hasCompleteVolunteerVehicleDetails({
            vehicle_type: pendingProfile.vehicleType,
            vehicle_color: pendingProfile.vehicleColor,
            vehicle_plate_number: pendingProfile.vehiclePlateNumber,
            vehicle_data_responsibility_ack: pendingProfile.vehicleDataResponsibilityAck,
          })) {
            throw new Error('بيانات السيارة والإقرار بالمسؤولية مطلوبة لتسجيل الشهم.');
          }

          const { data: createdProfile, error: createError } = await supabase
            .from('profiles')
            .upsert(
              {
                id: uid,
                first_name: pendingProfile.firstName,
                phone_number: pendingProfile.phone,
                role: pendingProfile.role,
                verification_status: 'unverified',
                ...(pendingProfile.role === 'requester'
                  ? {
                      patient_age: pendingProfile.patientAge === '' ? null : Number(pendingProfile.patientAge),
                      patient_condition: pendingProfile.patientCondition?.trim() || null,
                    }
                  : {}),
                ...(isVolunteer
                  ? {
                      vehicle_type: pendingProfile.vehicleType.trim(),
                      vehicle_color: pendingProfile.vehicleColor.trim(),
                      vehicle_plate_number: pendingProfile.vehiclePlateNumber.trim(),
                      vehicle_data_responsibility_ack: true,
                    }
                  : {}),
              },
              { onConflict: 'id' },
            )
            .select()
            .single();

          if (createError) throw createError;
          if (activeUserId.current !== uid) return;

          setProfile(createdProfile);
          if (createdProfile.role === 'volunteer') {
            setVehicleType(createdProfile.vehicle_type || '');
            setVehicleColor(createdProfile.vehicle_color || '');
            setVehiclePlateNumber(createdProfile.vehicle_plate_number || '');
            setVehicleDetailsConfirmed(createdProfile.vehicle_data_responsibility_ack === true);
          }
          localStorage.removeItem('shahm.pendingProfile');
        } else {
          setProfile(null);
          setProfileError(
            'بيانات الحساب غير مكتملة. سجّل الخروج وأعد الدخول بعد اختيار الدور.',
          );
        }
      } else {
        setProfile(data);
        if (data.role === 'volunteer') {
          setVehicleType(data.vehicle_type || '');
          setVehicleColor(data.vehicle_color || '');
          setVehiclePlateNumber(data.vehicle_plate_number || '');
          setVehicleDetailsConfirmed(data.vehicle_data_responsibility_ack === true);
        }
      }
    } catch (error: unknown) {
      setProfile(null);
      setProfileError(
        error instanceof Error
          ? error.message
          : 'تعذر تحميل بيانات المستخدم',
      );
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
      const enabled = await registerPushNotifications();
      if (enabled) {
        setPushEnabled(true);
      } else {
        setPushError(
          'لم يتم تفعيل الإشعارات. اسمح بالإشعارات من إعدادات المتصفح ثم حاول مرة أخرى.',
        );
      }
    } catch (error) {
      console.error('Enable push notifications failed:', error);
      setPushError('تعذر تفعيل الإشعارات. حاول مرة أخرى.');
    } finally {
      setPushLoading(false);
    }
  };

  useEffect(() => {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      setPushEnabled(true);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;

    const alreadyPrompted = localStorage.getItem('shahm.pushPrompted');
    if (alreadyPrompted) return;

    localStorage.setItem('shahm.pushPrompted', '1');

    const timer = setTimeout(() => {
      void handleEnablePushNotifications();
    }, 1500);

    return () => clearTimeout(timer);
  }, [profile]);

  const requestVolunteerLocation = () => {
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError('المتصفح لا يدعم تحديد الموقع.');
      return;
    }

    setLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setLocationError('تعذر قراءة موقعك الحالي.');
          setLocationLoading(false);
          return;
        }

        setVolunteerLocation({ lat, lng });
        setLocationLoading(false);
      },
      (error) => {
        let message = 'تعذر الحصول على موقعك الحالي.';
        if (error.code === error.PERMISSION_DENIED) {
          message =
            'اسمح للتطبيق باستخدام موقعك حتى نعرض الطلبات الموجودة ضمن 20 كم منك.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message =
            'موقعك الحالي غير متاح. جرّب تشغيل GPS ثم المحاولة مرة أخرى.';
        } else if (error.code === error.TIMEOUT) {
          message = 'انتهى وقت انتظار تحديد الموقع. حاول مرة أخرى.';
        }

        setLocationError(message);
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    );
  };

  const loadNearbyTrips = async (locationOverride?: {
    lat: number;
    lng: number;
  }) => {
    if (profile?.role !== 'volunteer') return;

    const location = locationOverride || volunteerLocation;
    if (!location) return;

    setLoadingNearbyTrips(true);

    try {
      const { data, error } = await supabase.rpc(
        'get_pending_trips_nearby',
        {
          p_lat: location.lat,
          p_lng: location.lng,
          p_radius_km: 20,
        },
      );

      if (error) throw error;
      setPendingTrips((data || []) as unknown as PublicTrip[]);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'تعذر تحميل الطلبات القريبة',
      );
    } finally {
      setLoadingNearbyTrips(false);
    }
  };

  const loadActiveVolunteerTrip = async (uid: string) => {
    const { data, error } = await supabase
      .from('trips')
      .select('id')
      .eq('volunteer_id', uid)
      .eq('status', 'accepted')
      .limit(1)
      .maybeSingle();

    if (error || !data) return;

    const { data: contact, error: contactError } = await supabase.rpc(
      'reveal_contact',
      { p_trip_id: data.id },
    );

    if (!contactError && contact && contact.length > 0) {
      setActiveVolunteerTripData(contact[0] as ContactCardData);
    }
  };

  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (cancelled) return;

        if (error) {
          setProfileError(`تعذر استعادة جلسة الدخول: ${error.message}`);
        }

        setSessionUser(session?.user ?? null);
        activeUserId.current = session?.user.id ?? null;

        if (session?.user) {
          void fetchProfile(session.user.id);
        } else {
          setSessionLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setProfileError(
          error instanceof Error
            ? error.message
            : 'تعذر استعادة جلسة الدخول',
        );
        setSessionLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
      activeUserId.current = session?.user.id ?? null;

      if (session?.user) {
        void fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
      }

      setSessionLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!profile) return;

    if (profile.role === 'requester') {
      const fetchActiveRequesterTrip = () => {
        supabase
          .from('trips')
          .select(TRIP_PUBLIC_COLUMNS)
          .in('status', ['pending', 'accepted'])
          .eq('requester_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .then(({ data, error }) => {
            if (error) {
              setErrorMessage(error.message);
              return;
            }

            if (data && data.length > 0) {
              const trip = data[0] as unknown as PublicTrip;
              setActiveRequesterTrip(trip);

              if (trip.status === 'accepted') {
                void supabase
                  .rpc('reveal_volunteer_contact', { p_trip_id: trip.id })
                  .then(({ data: contact, error: contactError }) => {
                    if (!contactError && contact && contact.length > 0) {
                      setVolunteerContactData(contact[0]);
                    }
                  });
              } else {
                setVolunteerContactData(null);
              }
            } else {
              setActiveRequesterTrip(null);
              setVolunteerContactData(null);
            }
          });
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
      requestVolunteerLocation();
      void loadActiveVolunteerTrip(profile.id);

      const channel = supabase
        .channel(`trips-realtime-${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'trips',
          },
          () => {
            if (volunteerLocation) {void reportVolunteerLocation(volunteerLocation.lat, volunteerLocation.lng);
            }
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
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
  }, [profile?.role, volunteerLocation]);

  const handleOpenSettings = () => {
    setSettingsFirstName(profile?.first_name ?? '');
    setSettingsPhone(profile?.phone_number ?? '');
    setSettingsError(null);
    setSettingsSuccess(false);
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    setSettingsError(null);
    setSettingsSuccess(false);

    if (
      !settingsFirstName.trim() ||
      !/^01\d{9}$/.test(settingsPhone.trim())
    ) {
      setSettingsError('أدخل الاسم ورقم هاتف مصري صحيح يبدأ بـ 01.');
      return;
    }

    const updates: Record<string, unknown> = {
      first_name: settingsFirstName.trim(),
      phone_number: settingsPhone.trim(),
    };

    setSettingsSaving(true);

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id)
      .select()
      .single();

    setSettingsSaving(false);

    if (error) {
      setSettingsError(error.message);
      return;
    }

    setProfile(updatedProfile);

    const pendingProfile = JSON.parse(
      localStorage.getItem('shahm.pendingProfile') || '{}',
    );
    localStorage.setItem(
      'shahm.pendingProfile',
      JSON.stringify({
        ...pendingProfile,
        firstName: settingsFirstName.trim(),
        phone: settingsPhone.trim(),
      }),
    );

    setSettingsSuccess(true);
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

  const handleGoogleLogin = async () => {
    setErrorMessage(null);

    if (
      !firstName.trim() ||
      !/^01\d{9}$/.test(phone.trim())
    ) {
      setErrorMessage('أدخل الاسم ورقم هاتف مصري صحيح يبدأ بـ 01.');
      return;
    }

    if (roleSelection === 'requester') {
      const parsedPatientAge = Number(patientAge);
      if (!Number.isInteger(parsedPatientAge) || parsedPatientAge < 0 || parsedPatientAge > 120) {
        setErrorMessage('أدخل عمر المريض من 0 إلى 120 سنة.');
        return;
      }
      if (patientCondition.trim().length < 2 || patientCondition.trim().length > 500) {
        setErrorMessage('اكتب الحالة الصحية للمريض بوضوح (من حرفين إلى 500 حرف).');
        return;
      }
    }

    if (roleSelection === 'volunteer') {
      if (
        vehicleType.trim().length < 2 || vehicleType.trim().length > 80 ||
        vehicleColor.trim().length < 2 || vehicleColor.trim().length > 40 ||
        vehiclePlateNumber.trim().length < 3 || vehiclePlateNumber.trim().length > 24
      ) {
        setErrorMessage('أدخل نوع السيارة ولونها ورقم لوحتها بصورة صحيحة.');
        return;
      }
      if (!vehicleDetailsConfirmed) {
        setErrorMessage('لازم توافق على إقرار صحة بيانات السيارة ومسؤوليتك عنها.');
        return;
      }
    }

    localStorage.setItem(
      'shahm.pendingProfile',
      JSON.stringify({
        firstName: firstName.trim(),
        phone: phone.trim(),
        role: roleSelection,
        ...(roleSelection === 'requester'
          ? {
              patientAge,
              patientCondition: patientCondition.trim(),
            }
          : {}),
        ...(roleSelection === 'volunteer'
          ? {
              vehicleType: vehicleType.trim(),
              vehicleColor: vehicleColor.trim(),
              vehiclePlateNumber: vehiclePlateNumber.trim(),
              vehicleDataResponsibilityAck: vehicleDetailsConfirmed,
            }
          : {}),
      }),
    );

    setAuthLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      setAuthLoading(false);
      setErrorMessage(`تعذر تسجيل الدخول عبر Google: ${error.message}`);
    }
  };

  const handleCreateTrip = async () => {
    if (!origin || !dest || !ackChecked || !scheduledAt || !problemType || !peopleCount) {
      return;
    }

    const parsedPeopleCount = Number(peopleCount);
    if (!Number.isInteger(parsedPeopleCount) || parsedPeopleCount < 1 || parsedPeopleCount > 8) {
      setErrorMessage('عدد الأشخاص يجب أن يكون من 1 إلى 8.');
      return;
    }

    const selectedDate = new Date(scheduledAt);
    const now = Date.now();
    const max = now + 48 * 60 * 60 * 1000;

    if (
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate.getTime() <= now ||
      selectedDate.getTime() > max
    ) {
      setErrorMessage('اختار موعدًا مستقبليًا خلال الـ 48 ساعة القادمة.');
      return;
    }

    setCreateTripLoading(true);
    setErrorMessage(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;

      if (!session?.access_token) {
        throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-trip-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
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
            scheduled_at: selectedDate.toISOString(),
            problem_type: problemType,
            people_count: parsedPeopleCount,
            request_notes: requestNotes.trim(),
          }),
        },
      );

      const responseText = await response.text();
      let resJson: { error?: string; trip_id?: string } = {};

      try {
        resJson = JSON.parse(responseText);
      } catch {
        resJson = { error: responseText };
      }

      if (!response.ok) {
        throw new Error(
          resJson.error || `فشل إنشاء الطلب (${response.status})`,
        );
      }

      if (!resJson.trip_id) {
        throw new Error('تم استلام الطلب بدون رقم طلب من الخادم');
      }

      const newTrip: PublicTrip = {
        id: resJson.trip_id,
        requester_id: profile?.id || session.user.id,
        volunteer_id: null,
        origin_area_label: origin.areaLabel,
        destination_area_label: dest.areaLabel,
        status: 'pending',
        requester_relation: relation,
        scheduled_at: selectedDate.toISOString(),
        created_at: new Date().toISOString(),
        problem_type: problemType,
        people_count: parsedPeopleCount,
        request_notes: requestNotes.trim(),
        accepted_at: null,
        completed_at: null,
      };

      setActiveRequesterTrip(newTrip);
      setScheduledAt('');
      setProblemType('');
      setPeopleCount('1');
      setRequestNotes('');
      setOrigin(null);
      setDest(null);
      setAckChecked(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر إنشاء طلب المساعدة.');
    } finally {
      setCreateTripLoading(false);
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

    const { data, error } = await supabase.rpc('accept_trip', {
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
        setErrorMessage(error.message);
      }

      setSelectedTripDetails(null);
      await loadNearbyTrips(volunteerLocation);
      return;
    }

    if (data && data.length > 0) {
      setActiveVolunteerTripData(data[0] as ContactCardData);
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
    const { error } = await supabase.rpc('cancel_trip', {
      p_trip_id: tripId,
    });

    if (!error) {
      setActiveRequesterTrip(null);
    } else {
      setErrorMessage(error.message);
    }
  };

  const handleCompleteTrip = async (tripId: string) => {
    const { error } = await supabase.rpc('complete_trip', {
      p_trip_id: tripId,
    });

    if (!error) {
      setActiveRequesterTrip(null);
      setActiveVolunteerTripData(null);
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

  if (!sessionUser && !roleSelection) {
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
              <img aria-hidden="true" alt="" src="/shahm-logo-mark-20260924.png" />
            </div>
            <span className="welcome-kicker">خير الناس أنفعهم للناس</span>
            <h1>أهلاً بك في شَهْم</h1>
            <p className="welcome-lead">الناس للناس</p>
            <p className="welcome-description">منصة مجتمعية لمساعدة المصابين بأمراض مزمنة والأكثر احتياجاً</p>

            <div className="welcome-actions" aria-label="اختر طريقة استخدام شَهْم">
              <button onClick={() => setRoleSelection('requester')} className="welcome-role-card">
                <span className="welcome-role-icon"><LocateFixed aria-hidden="true" /></span>
                <span className="welcome-role-copy"><strong>احتاج مساعدة</strong><small>اطلب مساندة من شهم قريب</small></span>
                <span className="welcome-role-arrow" aria-hidden="true">←</span>
              </button>
              <button onClick={() => setRoleSelection('volunteer')} className="welcome-role-card">
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

  if (!sessionUser) {
    return (
      <div className="shahm-auth-page shahm-signup-page min-h-screen bg-[#F7F8F9] flex flex-col justify-center items-center p-4">
        <div className="shahm-auth-card shahm-form-card w-full max-w-sm bg-white p-6 rounded-2xl shadow-sm border border-[#8A949E]/20">
          <div className="signup-brand-lockup">
            <img aria-hidden="true" alt="" src="/shahm-logo-mark-20260924.png" />
            <span>شَهْم</span>
          </div>
          <button
            onClick={() => setRoleSelection(null)}
            className="text-xs text-[#6B7280] mb-4 hover:text-[#1F2430]"
          >
            ← العودة للرئيسية
          </button>

          <h2 className="text-xl font-bold text-[#1F2430] mb-2">
            تسجيل طالب الرحلة
          </h2>
          <p className="text-sm leading-6 text-[#6B7280] mb-6">
            أدخل بياناتك للمتابعة وطلب المساعدة من شهم قريب.
          </p>

          {errorMessage && (
            <div className="p-3 mb-4 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleGoogleLogin();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-semibold text-[#1F2430] mb-1">
                اسمك الأول
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="مثال: أحمد"
                className="w-full h-[52px] px-4 bg-white border border-[#8A949E] rounded-xl text-base text-[#1F2430] focus:border-[#2F6FED] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1F2430] mb-1">
                رقم الجوال (للتواصل)
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full h-[52px] px-4 bg-white border border-[#8A949E] rounded-xl text-base text-[#1F2430] focus:border-[#2F6FED] focus:outline-none"
              />
            </div>

            {roleSelection === 'requester' && (
              <section className="patient-registration-fields" aria-labelledby="patient-registration-title">
                <div>
                  <h3 id="patient-registration-title" className="text-sm font-bold text-[#005131]">بيانات المريض</h3>
                  <p className="mt-1 text-xs leading-5 text-[#53645a]">تُستخدم لمساعدة الشهم على الاستعداد للرحلة.</p>
                </div>
                <label className="block text-sm font-semibold text-[#1F2430]">
                  عمر المريض
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={120}
                    step={1}
                    required
                    dir="ltr"
                    value={patientAge}
                    onChange={(event) => setPatientAge(event.target.value)}
                    placeholder="العمر بالسنوات"
                    className="mt-1 h-[48px] w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-semibold text-[#1F2430]">
                  الحالة الصحية للمريض
                  <textarea
                    required
                    minLength={2}
                    maxLength={500}
                    rows={3}
                    value={patientCondition}
                    onChange={(event) => setPatientCondition(event.target.value)}
                    placeholder="اكتب الحالة أو ما يحتاج الشهم لمعرفته"
                    className="mt-1 w-full resize-y rounded-xl border border-[#8A949E] bg-white px-3 py-3 text-sm font-normal"
                  />
                </label>
              </section>
            )}

            {roleSelection === 'volunteer' && (
              <div className="space-y-3 rounded-2xl border border-[#146B44]/15 bg-[#F7FBF8] p-4">
                <h3 className="text-sm font-bold text-[#005131]">بيانات السيارة</h3>
                <label className="block text-sm font-semibold text-[#1F2430]">
                  النوع والموديل
                  <input type="text" required minLength={2} maxLength={80} value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} placeholder="مثال: تويوتا كورولا" className="mt-1 h-[48px] w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal" />
                </label>
                <label className="block text-sm font-semibold text-[#1F2430]">
                  اللون
                  <input type="text" required minLength={2} maxLength={40} value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} placeholder="مثال: أبيض" className="mt-1 h-[48px] w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal" />
                </label>
                <label className="block text-sm font-semibold text-[#1F2430]">
                  رقم اللوحة
                  <input type="text" required minLength={3} maxLength={24} dir="auto" value={vehiclePlateNumber} onChange={(event) => setVehiclePlateNumber(event.target.value)} placeholder="اكتب رقم اللوحة كما يظهر على السيارة" className="mt-1 h-[48px] w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal" />
                </label>
                <label className="flex items-start gap-2 rounded-xl bg-white p-3 text-right text-xs leading-6 text-[#3f4942]">
                  <input type="checkbox" checked={vehicleDetailsConfirmed} onChange={(event) => setVehicleDetailsConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#146B44]" />
                  <span>أقرّ بأن بيانات السيارة صحيحة وعلى مسؤوليتي الشخصية، وأوافق على عدم تعديل بيانات السيارة بعد التسجيل.</span>
                </label>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleGoogleLogin()}
              disabled={authLoading}
              className="w-full h-[52px] bg-white border border-[#8A949E] text-[#1F2430] font-semibold rounded-xl text-base hover:bg-[#F7F8F9] transition-colors flex items-center justify-center gap-2"
            >
              {authLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span className="font-bold text-[#4285F4]">G</span>
              )}
              الدخول باستخدام Google
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
    ['ops_admin', 'super_admin', 'analytics_viewer'].includes(profile.role);

  const showRequesterView = profile?.role === 'requester';
  const showVolunteerView =
    profile?.role === 'volunteer' || (isAdmin && adminTab === 'trips');

  if (
    sessionUser &&
    ![
      'requester',
      'volunteer',
      'ops_admin',
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

      <header className="shahm-app-header sticky top-0 z-40 border-b border-[#8A949E]/20 bg-white px-4 py-3">
        <div className="mx-auto flex min-h-12 max-w-2xl items-center justify-center gap-3">
          <img
            aria-hidden="true"
            alt=""
            src="/shahm-logo-mark-20260924.png"
            className="h-10 w-10 shrink-0 object-contain"
          />
          <span className="text-xl font-extrabold tracking-wide text-[#005131]">شَهْم</span>
        </div>
      </header>

      <main id="main-content" className="shahm-app-main flex-1 max-w-2xl w-full mx-auto bg-[#F7F8F9] px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-4">
        <section className="-mx-4 border-b border-[#D8EEE1] bg-[#F0FBF4] px-5 pb-7 pt-6 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border-[7px] border-[#DDEFE5] bg-white shadow-sm">
            <img aria-hidden="true" alt="" src="/shahm-logo-mark-20260924.png" className="h-14 w-14 object-contain" />
          </div>
          <p className="text-base font-medium text-[#53645a]">أهلاً بك يا {profile?.first_name || 'صديق شهم'} في شهم</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-wide text-[#005131]">الناس للناس</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#65736B]">نساند بعضنا ونوصل المساعدة لمن يحتاجها، خطوة بخطوة.</p>
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
        {isAdmin && adminTab === 'safety' && <SafetyPanel />}
        {isAdmin && adminTab === 'analytics' && <AnalyticsDashboard />}
        {isAdmin && adminTab === 'usage' && <UsageMonitor />}

        {showRequesterView && (
          <>
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
                    <div className="flex h-24 w-24 mx-auto items-center justify-center rounded-full bg-[#E6F4ED]">
                      <Loader2 className="h-12 w-12 animate-spin text-[#146B44]" />
                    </div>

                    <h3 className="text-lg font-bold text-[#1F2430]">
                      جارٍ البحث عن شهم قريب...
                    </h3>

                    <p className="text-sm leading-6 text-[#53645a]">
                      نعرض طلب المساعدة على الشهمين القريبين منك الآن.
                    </p>

                    <div className="rounded-2xl border border-[#146B44]/10 bg-[#F7FBF8] p-4 text-right text-sm space-y-3">
                      <div className="flex items-center justify-between gap-3"><span className="text-[#6B7280]">نوع المشكلة</span><strong className="text-[#005131]">{activeRequesterTrip.problem_type || 'مساعدة عامة'}</strong></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-[#6B7280]">من</span><strong>{activeRequesterTrip.origin_area_label}</strong></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-[#6B7280]">إلى</span><strong>{activeRequesterTrip.destination_area_label}</strong></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-[#6B7280]">عدد الأشخاص</span><strong>{activeRequesterTrip.people_count ?? 1}</strong></div>
                      {activeRequesterTrip.request_notes && <div className="border-t border-[#146B44]/10 pt-2"><span className="block text-xs text-[#6B7280]">ملاحظاتك</span><p className="mt-1">{activeRequesterTrip.request_notes}</p></div>}
                      <div className="border-t border-[#146B44]/10 pt-2 text-xs text-[#6B7280]">الموعد: {formatScheduledAt(activeRequesterTrip.scheduled_at)}</div>
                    </div>

                    <button
                      onClick={() =>
                        void handleCancelTrip(activeRequesterTrip.id)
                      }
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

                    <div className="p-3 bg-[#F7F8F9] rounded-xl text-xs text-right">
                      <strong>الموعد:</strong>{' '}
                      {formatScheduledAt(activeRequesterTrip.scheduled_at)}
                    </div>

                    {volunteerContactData && (
                      <div className="p-3 bg-[#E6F4ED] rounded-xl text-right space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[#1F2430]">
                            {volunteerContactData.volunteer_first_name}
                          </span>
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

                    <button
                      onClick={() =>
                        void handleCompleteTrip(activeRequesterTrip.id)
                      }
                      className="w-full h-[52px] bg-[#146B44] text-white font-semibold rounded-xl text-base"
                    >
                      اكتملت المساعدة بأمان ✓
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
                <h2 className="text-lg font-bold text-[#1F2430]">
                  طلب مساعدة عالطريق
                </h2>

                {errorMessage && (
                  <div className="p-3 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <label className="block text-sm font-semibold text-[#1F2430]">
                  نوع المشكلة
                  <select required value={problemType} onChange={(event) => setProblemType(event.target.value)} className="mt-2 h-[52px] w-full rounded-xl border border-[#8A949E] bg-white px-4 text-sm font-normal focus:border-[#146B44] focus:outline-none">
                    <option value="" disabled>اختر نوع المشكلة</option>
                    {ROAD_PROBLEM_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-semibold text-[#1F2430]">عدد الأشخاص
                    <input type="number" required min={1} max={8} value={peopleCount} onChange={(event) => setPeopleCount(event.target.value)} className="mt-2 h-[52px] w-full rounded-xl border border-[#8A949E] bg-white px-4 text-sm font-normal" />
                  </label>
                  <label className="block text-sm font-semibold text-[#1F2430]">ملاحظات للمتطوع
                    <input type="text" maxLength={500} value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} placeholder="معلومة تساعد في تقديم المساعدة" className="mt-2 h-[52px] w-full rounded-xl border border-[#8A949E] bg-white px-4 text-sm font-normal" />
                  </label>
                </div>

                <LocationPicker
                  label="هتتحرك منين؟"
                  placeholder="ابحث عن منطقتك أو حيك"
                  onSelect={(val) => setOrigin(val)}
                  allowCurrentLocation
                />

                <LocationPicker
                  label="وجهتك"
                  placeholder="اكتب وجهتك أو أقرب معلم ليك"
                  onSelect={(val) => setDest(val)}
                />

                <div>
                  <label className="block text-sm font-semibold text-[#1F2430] mb-2">
                    موعد طلب المساعدة
                  </label>

                  <input
                    type="datetime-local"
                    required
                    min={dateTimeLimits.min}
                    max={dateTimeLimits.max}
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full h-[52px] px-4 bg-white border border-[#8A949E] rounded-xl text-base text-[#1F2430] focus:border-[#2F6FED] focus:outline-none"
                  />

                  <p className="text-[10px] text-[#6B7280] mt-1">
                    يمكن اختيار موعد خلال الـ 48 ساعة القادمة فقط.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#1F2430] mb-2">
                    الطلب ده لـ:
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'patient', label: 'أنا' },
                      { id: 'guardian', label: 'شخص تحت رعايتي' },
                      { id: 'companion', label: 'مرافقة شخص' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          setRelation(item.id as RequesterRelation)
                        }
                        className={`h-10 text-xs font-semibold rounded-lg border transition-colors ${
                          relation === item.id
                            ? 'border-[#146B44] bg-[#E6F4ED] text-[#146B44]'
                            : 'border-[#8A949E] bg-white text-[#1F2430]'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-[#F7F8F9] rounded-xl border border-[#8A949E]/30 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackChecked}
                      onChange={(e) => setAckChecked(e.target.checked)}
                      className="mt-1 accent-[#146B44] w-4 h-4"
                    />
                    <span className="text-xs text-[#1F2430] leading-relaxed">
                      أقر بأن هذا الطلب حقيقي، وأتحمل المسؤولية
                      الكاملة عن دقة البيانات المُدخلة.
                    </span>
                  </label>
                </div>

                <button
                  disabled={
                    !origin ||
                    !dest ||
                    !scheduledAt ||
                    !problemType ||
                    !peopleCount ||
                    !ackChecked ||
                    createTripLoading
                  }
                  onClick={() => void handleCreateTrip()}
                  className="w-full h-[52px] bg-[#146B44] disabled:opacity-40 active:bg-[#0F5636] text-white font-semibold rounded-xl text-base transition-colors flex items-center justify-center gap-2"
                >
                  {createTripLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'إرسال الطلب'
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {showVolunteerView && (
          <>
            {raceConditionDetected && (
              <RaceConditionToast
                onClose={() => setRaceConditionDetected(false)}
              />
            )}

            {activeVolunteerTripData ? (
              <div className="shahm-trip-card bg-white p-6 rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs bg-[#E6F4ED] text-[#146B44] px-3 py-1 rounded-full font-semibold">
                    تم قبول طلب المساعدة بنجاح
                  </span>
                  <ShieldCheck className="w-5 h-5 text-[#146B44]" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-[#1F2430]">
                    {activeVolunteerTripData.requester_first_name}
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    {activeVolunteerTripData.requester_relation ===
                      'patient' && 'أنا'}
                    {activeVolunteerTripData.requester_relation ===
                      'guardian' && 'شخص تحت رعايتي'}
                    {activeVolunteerTripData.requester_relation ===
                      'companion' && 'مرافق'}
                  </p>
                </div>

                <div className="p-3 bg-[#F7F8F9] rounded-xl text-xs space-y-2 text-right">
                  <div>
                    <strong>موعد طلب المساعدة:</strong>{' '}
                    {formatScheduledAt(
                      activeVolunteerTripData.scheduled_at,
                    )}
                  </div>

                  <div className="rounded-xl bg-[#E6F4ED] p-3 font-bold text-[#005131]">نوع المشكلة: {activeVolunteerTripData.problem_type || 'مساعدة عامة'}</div>
                  <div><strong>عدد الأشخاص:</strong> {activeVolunteerTripData.people_count ?? 1}</div>
                  {activeVolunteerTripData.request_notes && <div><strong>ملاحظات صاحب الطلب:</strong> {activeVolunteerTripData.request_notes}</div>}

                  <div>
                    <strong>نقطة الانطلاق:</strong>{' '}
                    {activeVolunteerTripData.origin_address}
                  </div>

                  <div>
                    <strong>الوجهة:</strong>{' '}
                    {activeVolunteerTripData.destination_address}
                  </div>

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
                  ✓ تم تقديم المساعدة بأمان
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
                <div className="bg-white p-4 rounded-2xl border border-[#8A949E]/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-[#1F2430]">
                        طلبات المساعدة القريبة
                      </h2>
                      <p className="text-[11px] text-[#6B7280] mt-1">
                        تظهر طلبات المساعدة ونوع المشكلة للشهمين ضمن 20 كم.
                      </p>
                    </div>

                    <LocateFixed className="w-5 h-5 text-[#146B44]" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {volunteerLocation ? (
                      <div className="flex items-center justify-between bg-[#E6F4ED] rounded-xl px-3 py-2">
                        <span className="text-[11px] text-[#146B44] font-semibold">
                          تم تحديد موقعك
                        </span>

                        <button
                          onClick={requestVolunteerLocation}
                          disabled={locationLoading}
                          className="text-[11px] text-[#146B44] font-semibold flex items-center gap-1"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              locationLoading ? 'animate-spin' : ''
                            }`}
                          />
                          تحديث
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={requestVolunteerLocation}
                        disabled={locationLoading}
                        className="w-full h-11 bg-[#146B44] text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                      >
                        {locationLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <LocateFixed className="w-4 h-4" />
                        )}
                        تحديد موقعي وعرض الطلبات القريبة
                      </button>
                    )}
                  </div>

                  {locationError && (
                    <div className="p-3 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{locationError}</span>
                    </div>
                  )}

                  {pushError && (
                    <div className="p-3 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex gap-2">
                      <Bell className="w-4 h-4 shrink-0" />
                      <span>{pushError}</span>
                    </div>
                  )}

                  {errorMessage && (
                    <div className="p-3 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </div>

                <h2 className="text-base font-bold text-[#1F2430] flex items-center justify-between">
                  <span>طلبات المساعدة على الطريق</span>
                  <span className="text-xs font-normal text-[#6B7280]">
                    ({pendingTrips.length})
                  </span>
                </h2>

                {loadingNearbyTrips ? (
                  <div className="bg-white p-8 rounded-2xl border border-[#8A949E]/20 text-center">
                    <Loader2 className="w-8 h-8 text-[#146B44] mx-auto animate-spin" />
                    <p className="text-xs text-[#6B7280] mt-3">
                      بنبحث عن طلبات المساعدة القريبة...
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
                      لا توجد طلبات مساعدة قريبة الآن
                    </p>
                    <p className="text-xs text-[#6B7280]">
                      هنظهر لك الطلبات الجديدة الموجودة ضمن 20 كم.
                    </p>
                  </div>
                ) : (
                  pendingTrips.map((trip) => (
                    <div
                      key={trip.id}
                      onClick={() => setSelectedTripDetails(trip)}
                      className="shahm-request-card bg-[#FFFFFF] p-4 rounded-2xl border border-[#8A949E]/20 shadow-sm cursor-pointer hover:border-[#146B44] transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs text-[#6B7280]">
                        <span className="bg-[#FBEFDC] text-[#8F5A0A] px-2 py-0.5 rounded-md font-medium">
                          {trip.requester_relation === 'patient' && 'أنا'}
                          {trip.requester_relation === 'guardian' && 'شخص تحت رعايتي'}
                          {trip.requester_relation === 'companion' && 'مرافق'}
                        </span>
                        <span>{formatScheduledAt(trip.scheduled_at)}</span>
                      </div>

                      <div className="text-sm font-bold text-[#1F2430] flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#146B44] shrink-0" />
                        <span>{trip.origin_area_label}</span>
                        <span className="text-[#6B7280]">⟶</span>
                        <span>{trip.destination_area_label}</span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-[#E6F4ED] px-3 py-1 text-xs font-bold text-[#005131]">نوع المشكلة: {trip.problem_type || 'مساعدة عامة'}</span>
                        <span className="text-xs text-[#53645a]">عدد الأشخاص: {trip.people_count ?? 1}</span>
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

            {selectedTripDetails && (
              <div
                className="fixed inset-0 z-50 bg-black/40 flex flex-col justify-end p-0"
                role="dialog"
                aria-modal="true"
              >
                <div className="bg-[#FFFFFF] rounded-t-3xl p-6 space-y-4 max-w-md mx-auto w-full">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-[#1F2430]">
                      تفاصيل طلب المساعدة
                    </h3>
                    <button
                      onClick={() => setSelectedTripDetails(null)}
                      className="text-[#6B7280]"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="space-y-2 text-sm text-[#1F2430]">
                    <div className="rounded-xl bg-[#E6F4ED] p-3 font-bold text-[#005131]">نوع المشكلة: {selectedTripDetails.problem_type || 'مساعدة عامة'}</div>
                    {selectedTripDetails.request_notes && <div><strong>ملاحظات:</strong> {selectedTripDetails.request_notes}</div>}
                    <div><strong>عدد الأشخاص:</strong> {selectedTripDetails.people_count ?? 1}</div>
                    <div>
                      <strong>من:</strong>{' '}
                      {selectedTripDetails.origin_area_label}
                    </div>
                    <div>
                      <strong>إلى:</strong>{' '}
                      {selectedTripDetails.destination_area_label}
                    </div>
                    <div>
                      <strong>الموعد:</strong>{' '}
                      {formatScheduledAt(selectedTripDetails.scheduled_at)}
                    </div>
                  </div>

                  <button
                    disabled={acceptingTripId === selectedTripDetails.id}
                    onClick={() => void handleAcceptTrip(selectedTripDetails.id)}
                    className="w-full h-[52px] bg-[#146B44] active:bg-[#0F5636] text-white font-semibold rounded-xl text-base flex items-center justify-center gap-2"
                  >
                    {acceptingTripId === selectedTripDetails.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'قبول المشوار'
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {showSettings && (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label="الإعدادات وتعديل البيانات"
          >
            <div className="bg-[#FFFFFF] rounded-2xl max-w-md w-full p-6 text-right shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-[#8A949E]/20 pb-3">
                <h3 className="text-lg font-bold text-[#1F2430]">
                  تعديل بيانات الحساب
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-[#6B7280] hover:text-[#1F2430]"
                >
                  <X className="w-5 h-5" />
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
                  onClick={() => setShowSettings(false)}
                  className="px-4 h-11 border border-[#8A949E] text-[#6B7280] text-sm font-semibold rounded-xl"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {reportModalOpen && activeRequesterTrip && (
          <ReportModal
            isOpen={reportModalOpen}
            tripId={activeRequesterTrip.id}
            reportedProfileId={activeRequesterTrip.volunteer_id}
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
            reportedProfileId={null}
            onClose={() => setReportModalOpen(false)}
            onSuccess={() => {
              setReportModalOpen(false);
              setReportSuccess(true);
            }}
          />
        )}

        {sessionUser && (
          <div className="flex items-center justify-center gap-6 border-t border-[#8A949E]/20 py-5 text-sm">
            <button type="button" onClick={handleOpenSettings} className="min-h-11 px-3 font-semibold text-[#146B44]">
              الإعدادات
            </button>
            <button type="button" onClick={handleSignOut} className="min-h-11 px-3 font-medium text-[#6B7280]">
              تسجيل الخروج
            </button>
          </div>
        )}
      </main>

      <nav aria-label="التنقل الرئيسي" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#146B44]/10 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(16,37,27,0.08)]">
        <div className="mx-auto grid max-w-2xl grid-cols-3">
          <button type="button" onClick={() => { setActiveBottomTab('account'); handleOpenSettings(); }} className={'flex min-h-[68px] flex-col items-center justify-center gap-1 border-l border-[#146B44]/10 text-xs ' + (activeBottomTab === 'account' ? 'bg-[#E6F4ED] font-bold text-[#005131]' : 'text-[#53645a]')}>
            <UserRound className="h-5 w-5" aria-hidden="true" />
            <span>حسابي</span>
          </button>
          <button type="button" onClick={() => { setActiveBottomTab('guidance'); setShowGuidance(true); }} className={'flex min-h-[68px] flex-col items-center justify-center gap-1 border-l border-[#146B44]/10 text-xs ' + (activeBottomTab === 'guidance' ? 'bg-[#E6F4ED] font-bold text-[#005131]' : 'text-[#53645a]')}>
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            <span>الإرشادات</span>
          </button>
          <button type="button" onClick={() => { setActiveBottomTab('trips'); setShowGuidance(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={'flex min-h-[68px] flex-col items-center justify-center gap-1 text-xs ' + (activeBottomTab === 'trips' ? 'bg-[#E6F4ED] font-bold text-[#005131]' : 'text-[#53645a]')}>
            <CarFront className="h-5 w-5" aria-hidden="true" />
            <span>المشاوير</span>
          </button>
        </div>
      </nav>

      {showGuidance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10251b]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="guidance-title">
          <section className="w-full max-w-md space-y-4 rounded-3xl bg-white p-5 text-right shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 id="guidance-title" className="text-lg font-bold text-[#005131]">إرشادات شهم</h2>
              <button type="button" onClick={() => setShowGuidance(false)} aria-label="إغلاق الإرشادات" className="flex h-11 w-11 items-center justify-center rounded-full text-[#53645a] hover:bg-[#F7FBF8]"><X className="h-5 w-5" /></button>
            </div>
            <ul className="space-y-3 text-sm leading-6 text-[#3f4942]">
              <li>اختر نوع المشكلة بدقة واكتب ملاحظة تساعد الشهم على الاستعداد.</li>
              <li>تأكد من صحة نقطتي البداية والنهاية وعدد الأشخاص قبل إرسال الطلب.</li>
              <li>بعد قبول الطلب ستظهر بيانات التواصل والمسافة وبيانات سيارة الشهم.</li>
              <li>شارك موقعك الحالي فقط عند استخدام التطبيق لعرض الطلبات القريبة.</li>
            </ul>
            <button type="button" onClick={() => setShowGuidance(false)} className="min-h-12 w-full rounded-xl bg-[#146B44] font-bold text-white">فهمت</button>
          </section>
        </div>
      )}
    </div>
  );
};

export default App;



