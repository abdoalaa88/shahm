import React, { useState, useEffect, useRef } from 'react';
import { hasSupabaseConfig, supabase, supabaseUrl, UserRole, PublicTrip, ContactCardData, RequesterRelation, NearbyTrip } from './lib/supabase';
import { LocationPicker } from './components/common/LocationPicker';
import { ReportModal } from './components/common/ReportModal';
import { RaceConditionToast } from './components/common/StateViews';
import { SafetyPanel } from './components/admin/SafetyPanel';
import { AnalyticsDashboard } from './components/admin/AnalyticsDashboard';
import { UsageMonitor } from './components/admin/UsageMonitor';
import { UsersPanel } from './components/admin/UsersPanel';
import { toWhatsAppNumber } from './lib/phone';
import { useInstallPrompt } from './lib/useInstallPrompt';
import { notifyTripAccepted, registerPushNotifications } from './lib/push';
import {
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
  CalendarClock,
  Navigation,
  HeartPulse,
  LocateFixed,
  ArrowLeft,
  CarFront,
  HeartHandshake,
  UserRound,
  Settings2,
  BookOpen,
  LockKeyhole,
  Shield,
  Route,
  Handshake,
  UserRoundCheck
} from 'lucide-react';

type InstallNoticeProps = {
  canInstall: boolean;
  showManualInstructions: boolean;
  onInstall: () => Promise<void>;
  onDismiss: () => void;
  message: string | null;
};

const InstallNotice: React.FC<InstallNoticeProps> = ({ canInstall, showManualInstructions, onInstall, onDismiss, message }) => (
  <div
    role="status"
    aria-label="تثبيت تطبيق شَهْم"
    className="w-full max-w-2xl mx-auto mb-3 bg-[#E6F4ED] border border-[#146B44]/20 rounded-xl px-4 py-2.5"
  >
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 shrink-0 bg-white text-[#146B44] rounded-full flex items-center justify-center shadow-sm">
        <Download className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0 text-xs text-[#146B44] leading-snug">
        {message ? (
          <span className="font-semibold">{message}</span>
        ) : showManualInstructions ? (
          <span>لتثبيت شَهْم: زر المشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية».</span>
        ) : (
          <span>ثبّت تطبيق شَهْم على شاشتك الرئيسية للوصول السريع وتلقي التنبيهات.</span>
        )}
      </div>

      {!message && canInstall && (
        <button
          onClick={onInstall}
          className="shrink-0 h-8 px-3 rounded-lg bg-[#146B44] active:bg-[#0F5636] text-white text-xs font-bold flex items-center gap-1 transition-colors"
        >
          تثبيت
        </button>
      )}

      <button
        onClick={onDismiss}
        aria-label="إغلاق"
        className="shrink-0 text-[#146B44]/60 hover:text-[#146B44] p-1 rounded-full transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
);

const BrandMark: React.FC<{ className?: string }> = ({ className = 'w-20 h-20' }) => (
  <svg viewBox="0 0 120 120" className={className} aria-label="شعار شَهْم" role="img">
    <defs>
      <linearGradient id="shahmBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1E8E5A" />
        <stop offset="100%" stopColor="#146B44" />
      </linearGradient>
      <linearGradient id="shahmSoftGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E6F4ED" />
        <stop offset="100%" stopColor="#C2E6D4" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="56" fill="url(#shahmSoftGlow)" />
    <circle cx="60" cy="60" r="48" fill="#FFFFFF" />
    <path d="M60 28 C64 36 76 46 76 58 C76 67.5 68.8 75 60 75 C51.2 75 44 67.5 44 58 C44 46 56 36 60 28 Z" fill="url(#shahmBrandGrad)"/>
    <circle cx="60" cy="56" r="6" fill="#FFFFFF"/>
    <path d="M36 70 C42 82 50 88 60 88 C70 88 78 82 84 70 C80 76 71 82 60 82 C49 82 40 76 36 70 Z" fill="#146B44"/>
  </svg>
);

const TRIP_PUBLIC_COLUMNS = 'id, requester_id, volunteer_id, origin_area_label, destination_area_label, status, requester_relation, created_at, accepted_at, completed_at, scheduled_at, passenger_count, special_notes';
const PENDING_PROFILE_KEY = 'shahm.pendingProfile';

const StitchBottomNav: React.FC<{ active: 'trips' | 'request' | 'guides' | 'account'; onChange: (tab: 'trips' | 'request' | 'guides' | 'account') => void; showRequest: boolean }> = ({ active, onChange, showRequest }) => {
  const items = [
    { id: 'trips' as const, label: 'المشاوير', icon: CarFront },
    { id: 'request' as const, label: 'طلب عون', icon: Handshake },
    { id: 'guides' as const, label: 'الإرشادات', icon: BookOpen },
    { id: 'account' as const, label: 'حسابي', icon: UserRound },
  ].filter((item) => showRequest || item.id !== 'request');

  return (
    <nav className="stitch-bottom-nav fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]" aria-label="التنقل الرئيسي">
      <div className="mx-auto flex h-20 max-w-2xl items-center justify-around px-2">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`flex h-14 w-20 flex-col items-center justify-center gap-1 rounded-xl text-xs transition-colors ${active === id ? 'font-bold text-[#005131]' : 'text-[#3f4942]'}`}
          >
            <Icon className="h-6 w-6" strokeWidth={active === id ? 2.4 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export const App: React.FC = () => {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'setup'>('login');

  // Admin View State
  const [adminTab, setAdminTab] = useState<'trips' | 'safety' | 'analytics' | 'usage' | 'users'>('trips');
  const [activeAppTab, setActiveAppTab] = useState<'trips' | 'request' | 'guides' | 'account'>('trips');

  // Auth States
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSetupRequired, setProfileSetupRequired] = useState(false);
  const activeUserId = useRef<string | null>(null);
  const profileRequestId = useRef(0);

  // Requester States
  const [origin, setOrigin] = useState<{ areaLabel: string; fullAddress: string; lat: number; lng: number } | null>(null);
  const [dest, setDest] = useState<{ areaLabel: string; fullAddress: string; lat: number; lng: number } | null>(null);
  const [relation, setRelation] = useState<RequesterRelation>('patient');
  const [ackChecked, setAckChecked] = useState(false);
  const [createTripLoading, setCreateTripLoading] = useState(false);
  const [tripActionLoading, setTripActionLoading] = useState(false);
  const [activeRequesterTrip, setActiveRequesterTrip] = useState<PublicTrip | null>(null);
  const [tripTiming, setTripTiming] = useState<'now' | 'scheduled'>('now');
  const [scheduledDay, setScheduledDay] = useState<0 | 1 | 2>(0);
  const [scheduledTime, setScheduledTime] = useState('');
  const [scheduledHour, setScheduledHour] = useState('');
  const [scheduledMinute, setScheduledMinute] = useState('00');
  const [scheduledPeriod, setScheduledPeriod] = useState<'AM' | 'PM'>('AM');
  const [passengerCount, setPassengerCount] = useState(1);
  const [specialNotes, setSpecialNotes] = useState('');
  const [assistanceType, setAssistanceType] = useState('tire');
  const [assistanceDescription, setAssistanceDescription] = useState('');
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceSuccess, setAssistanceSuccess] = useState(false);

  // Patient safety brief — collected once on the requester's profile.
  const [patientAge, setPatientAge] = useState('');
  const [patientCondition, setPatientCondition] = useState('');

  // Volunteer States
  const [pendingTrips, setPendingTrips] = useState<NearbyTrip[]>([]);
  const [activeVolunteerTripData, setActiveVolunteerTripData] = useState<ContactCardData | null>(null);
  const [selectedTripDetails, setSelectedTripDetails] = useState<NearbyTrip | null>(null);
  const [acceptingTripId, setAcceptingTripId] = useState<string | null>(null);
  const [raceConditionDetected, setRaceConditionDetected] = useState(false);
  const [volunteerLocation, setVolunteerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [volunteerLocationStatus, setVolunteerLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [volunteerLocationError, setVolunteerLocationError] = useState<string | null>(null);

  // Report Modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const { canInstall, showManualInstructions, showInstallPrompt, install } = useInstallPrompt();

  const handleInstall = async () => {
    const installed = await install();
    if (installed) {
      await registerPushNotifications();
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) setProfileError(`تعذر استعادة جلسة الدخول: ${error.message}`);
      setSessionUser(session?.user ?? null);
      activeUserId.current = session?.user.id ?? null;
      if (session?.user) fetchProfile(session.user.id);
      else setSessionLoading(false);
    }).catch((error: unknown) => {
      setProfileError(error instanceof Error ? error.message : 'تعذر استعادة جلسة الدخول');
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

      let profileQuery = supabase.from('profiles').select('*').eq('auth_user_id', uid);
      if (pendingProfile?.role) profileQuery = profileQuery.eq('role', pendingProfile.role);
      const { data, error } = await profileQuery.limit(1).maybeSingle();
      if (error) throw error;
      if (activeUserId.current !== uid || profileRequestId.current !== requestId) return;
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
          localStorage.removeItem(PENDING_PROFILE_KEY);
          sessionStorage.removeItem(PENDING_PROFILE_KEY);
          setProfileSetupRequired(false);
        } else {
          setProfile(null);
          setRoleSelection(pendingProfile?.role || null);
          setAuthMode('setup');
          setProfileSetupRequired(true);
        }
      } else {
        setProfile(data);
        setProfileSetupRequired(false);
      }
    } catch (error: unknown) {
      if (activeUserId.current === uid && profileRequestId.current === requestId) {
        setProfile(null);
        setProfileError(error instanceof Error ? error.message : 'تعذر تحميل بيانات المستخدم');
      }
    } finally {
      if (profileRequestId.current === requestId) {
        setProfileLoading(false);
        setSessionLoading(false);
      }
    }
  };

  const volunteerLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const fetchVolunteerNearbyTrips = (lat: number, lng: number) => {
    supabase
      .rpc('get_pending_trips_nearby', { p_lat: lat, p_lng: lng, p_radius_km: 7 })
      .then(({ data, error }) => {
        if (error) {
          setVolunteerLocationError(translateTripError(error.message));
          return;
        }
        if (data) setPendingTrips(data as NearbyTrip[]);
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

  useEffect(() => {
    if (!profile) return;

    if (profile.role === 'requester') {
      supabase
        .from('trips')
        .select(TRIP_PUBLIC_COLUMNS)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data, error }) => {
          if (error) setErrorMessage(`تعذر تحميل الرحلة الحالية: ${error.message}`);
          if (data && data.length > 0) setActiveRequesterTrip(data[0] as unknown as PublicTrip);
        });

      const channel = supabase
        .channel(`requester-trips-${profile.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
          supabase
            .from('trips')
            .select(TRIP_PUBLIC_COLUMNS)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false })
            .limit(1)
            .then(({ data }) => setActiveRequesterTrip(data?.[0] as unknown as PublicTrip || null));
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }

    if (profile.role === 'volunteer') {
      requestVolunteerLocation();

      supabase
        .from('trips')
        .select('id')
        .eq('volunteer_id', profile.id)
        .eq('status', 'accepted')
        .maybeSingle()
        .then(async ({ data, error }) => {
          if (error) {
            setErrorMessage(`تعذر تحميل الرحلة المقبولة: ${error.message}`);
            return;
          }
          if (data) {
            const { data: contact, error: contactError } = await supabase.rpc('reveal_contact', { p_trip_id: data.id });
            if (contactError) {
              setErrorMessage(`تعذر تحميل بيانات التواصل: ${contactError.message}`);
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

      return () => {
        supabase.removeChannel(channel);
      };
    }

    if (typeof profile.role === 'string' && profile.role.includes('admin')) {
      // Admin oversight is not bound by the volunteer 20km radius — it shows
      // every pending trip, without distance or the patient safety brief.
      supabase
        .from('trips')
        .select(TRIP_PUBLIC_COLUMNS)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) setErrorMessage(`تعذر تحميل طلبات الإدارة: ${error.message}`);
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
      setErrorMessage(`تعذر تسجيل الدخول عبر Google: ${error.message}`);
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
      setProfileError(`تعذر إنشاء ملف الحساب: ${error.message}`);
      return;
    }

    setProfile(data);
    setProfileSetupRequired(false);
    setProfileError(null);
    localStorage.removeItem(PENDING_PROFILE_KEY);
    sessionStorage.removeItem(PENDING_PROFILE_KEY);
    setAuthLoading(false);
  };

  const handleCreateTrip = async () => {
    if (!origin || !dest || !ackChecked) return;
    if (tripTiming === 'scheduled' && (scheduleInvalidReason || !scheduledDate)) return;
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
          scheduled_at: scheduledDate
            ? scheduledDate.toISOString()
            : new Date(Date.now() + 60_000).toISOString(),
          passenger_count: passengerCount,
          special_notes: specialNotes.trim() || null,
        }),
      });

      const responseText = await response.text();
      let resJson: { error?: string; trip_id?: string } = {};
      try {
        resJson = JSON.parse(responseText);
      } catch {
        resJson = { error: responseText };
      }
      if (!response.ok) throw new Error(translateTripError(resJson.error || `فشل إنشاء الطلب (${response.status})`));
      if (!resJson.trip_id) throw new Error('تم استلام الطلب بدون رقم طلب من الخادم');

      const { data, error: tripLoadError } = await supabase
        .from('trips')
        .select(TRIP_PUBLIC_COLUMNS)
        .eq('id', resJson.trip_id)
        .single();

      if (tripLoadError) throw new Error(`تم إنشاء الطلب لكن تعذر تحميله: ${tripLoadError.message}`);
      if (data) setActiveRequesterTrip(data as unknown as PublicTrip);
    } catch (err: any) {
      setErrorMessage(err.message);
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
    const { error } = await supabase.rpc('create_assistance_request', {
      p_issue_type: assistanceType,
      p_description: assistanceDescription.trim(),
    });
    setAssistanceLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setAssistanceDescription('');
    setAssistanceSuccess(true);
  };

  const translateTripError = (message: string): string => {
    const map: Array<[string, string]> = [
      ['trip is outside the maximum distance', 'الطلب ده بره نطاق الـ٢٠ كيلومتر منك.'],
      ['volunteer location is required', 'محتاجين نعرف موقعك الحالي الأول.'],
      ['volunteer role required', 'الميزة دي لصلاحية الشهم بس.'],
      ['trip is no longer available', 'الطلب ده اتقبل من شهم تاني.'],
      ['scheduled time must be within the next two days', 'ميعاد الرحلة لازم يكون خلال يومين من دلوقتي.'],
      ['one open trip is allowed', 'عندك طلب مفتوح بالفعل، استنى يخلص الأول.'],
    ];
    const match = map.find(([needle]) => message.includes(needle));
    return match ? match[1] : message;
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
        setErrorMessage(translateTripError(error.message));
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
    else setErrorMessage(error.message);
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
      setErrorMessage(error.message);
    }
    setTripActionLoading(false);
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

  if (sessionUser && profileError && !profileSetupRequired) {
    return (
      <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center p-4 text-center">
        <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#FCEAEA] space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-[#B53A3A]" />
          <h2 className="font-bold text-[#1F2430]">تعذر تحميل دور الحساب</h2>
          <p className="text-xs text-[#6B7280]">{profileError}</p>
          <button onClick={handleSignOut} className="text-xs text-[#146B44] font-bold">تسجيل الخروج</button>
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
        <h2 className="text-lg font-bold text-[#1F2430] mb-2">الحساب غير نشط مؤقتاً</h2>
        <p className="text-xs text-[#6B7280] max-w-xs mb-6 leading-relaxed">
          تم تعليق استخدام هذا الحساب مؤقتاً لمراجعة معايير السلامة والتكافل.
        </p>
        <button onClick={handleSignOut} className="text-xs text-[#146B44] font-bold">
          تسجيل الخروج
        </button>
      </div>
    );
  }

  if (!sessionUser && !roleSelection && authMode === 'login') {
    return (
      <div className="stitch-page px-4 py-6">
        {configurationNotice}
        {installNotice}

        <div className="mx-auto w-full max-w-[480px]">
          <header className="mb-3 flex items-center justify-between px-1">
            <button aria-label="تسجيل الدخول" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#146B44] text-white shadow-sm">
              <UserRound className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <BrandMark className="h-8 w-8" />
              <span className="text-[1.5rem] font-black tracking-tight text-[#146B44]">شَهْم</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#146B44]/10 bg-white/80 shadow-sm">
                <Settings2 className="h-4 w-4 text-[#146B44]" />
              </div>
            </div>
          </header>

          <main className="flex flex-col gap-5 px-1 pb-4 pt-4">
            <div className="mb-5 flex justify-center">
              <div className="flex h-36 w-36 items-center justify-center rounded-full border-[10px] border-[#dfece4] bg-white/70 shadow-[0_12px_32px_rgba(20,107,68,0.08)]">
                <BrandMark className="h-20 w-20" />
              </div>
            </div>

            <h1 className="mb-1 text-center text-[2rem] font-bold leading-[1.35] text-[#005131]">
              أهلاً بك في شَهْم
            </h1>
            <p className="mx-auto max-w-[330px] text-center text-sm leading-7 text-[#3f4942]">
              الناس للناس . منصة اجتماعية لتوصيل المرضى الأكثر احتياجًا لمواعيد العلاج وأماكن الرعاية بأمان وكرامة
            </p>

            <div className="stitch-soft-card flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#146b44] text-white"><HeartHandshake className="h-5 w-5" /></div>
              <p className="text-sm font-semibold leading-6 text-[#005131]">مشاوير مجانية للمواعيد العلاجية، والناس لبعضها.</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleGoogleLogin('volunteer')}
                disabled={authLoading}
                className="group flex min-h-[58px] w-full items-center justify-between rounded-xl bg-[#005131] px-4 py-2 text-right text-white shadow-lg active:scale-[0.99]"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
                    <CarFront className="h-5 w-5" />
                  </span>
                  <span className="flex flex-col text-right"><span className="text-base font-bold">الدخول كشهم</span><span className="text-xs text-[#98e9b8]">أرغب في مساعدة الناس وكسب الأجر</span></span>
                </span>
                <ArrowLeft className="h-5 w-5 opacity-80" />
              </button>

              <button
                onClick={() => handleGoogleLogin('requester')}
                disabled={authLoading}
                className="group flex min-h-[58px] w-full items-center justify-between rounded-xl bg-white px-4 py-2 text-right text-[#005131] shadow-md active:scale-[0.99]"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F4ED]">
                    <HeartHandshake className="h-5 w-5 text-[#146B44]" />
                  </span>
                  <span className="flex flex-col text-right"><span className="text-base font-bold">الدخول كصاحب طلب</span><span className="text-xs text-[#3f4942]">محتاج مشوار لميعادي الطبي</span></span>
                </span>
                <ArrowLeft className="h-5 w-5 text-[#6f7a71]" />
              </button>
            </div>

            <div className="flex items-center gap-3"><div className="h-px flex-1 bg-[#bfc9bf]" /><span className="text-xs text-[#6f7a71]">أو المتابعة السريعة</span><div className="h-px flex-1 bg-[#bfc9bf]" /></div>
            <div className="stitch-soft-card flex items-start gap-3 p-4">
              <LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-[#005131]" />
              <p className="text-xs leading-6 text-[#3f4942]">خدمة غير ربحية ومجانية بالكامل، وبياناتك وخصوصيتك في أمان تام.</p>
            </div>

          </main>
        </div>
      </div>
    );
  }

  if (!sessionUser || profileSetupRequired) {
    return (
      <div className="min-h-screen bg-[#EAF5EE] px-4 py-6 text-[#101f17]">
        {configurationNotice}
        {installNotice}

        <div className="mx-auto w-full max-w-[480px]">
          <header className="mb-4 flex items-center justify-between px-1">
            <button aria-label="عودة" onClick={() => { if (profileSetupRequired) { handleSignOut(); } else { setRoleSelection(null); setAuthMode('login'); } }} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#146B44] text-white shadow-sm">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[1.5rem] font-black tracking-tight text-[#146B44]">شَهْم</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#146B44]/10 bg-white/80 shadow-sm">
                <UserRound className="h-4 w-4 text-[#146B44]" />
              </div>
            </div>
          </header>

          <div className="rounded-[28px] bg-[#EAF5EE] shadow-[0_0_0_1px_rgba(20,107,68,0.04)] p-5">
            <div className="mb-4 rounded-[18px] bg-[#eaf6ef] p-3 shadow-sm">
              <div className="flex items-center gap-2 text-[#146B44]">
                <span className="text-[0.8rem] font-bold">خطوة البداية في شَهْم</span>
              </div>
              <h2 className="mt-2 text-[1.75rem] font-black leading-[1.3] text-[#1F2430]">اختار دورك في شَهْم</h2>
              <p className="mt-2 text-[0.9rem] leading-[1.7] text-[#4b5f55]">
                نسعى لربط القلوب الرحيمة بمن يحتاج العون في طريقه للشفاء، بكرامة وأمان مجتمعي كامل.
              </p>
            </div>

            {errorMessage && (
              <div className="mb-4 flex items-center gap-2 rounded-[16px] bg-[#FCEAEA] p-3 text-[0.82rem] text-[#B53A3A]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {profileSetupRequired && !roleSelection && (
              <div className="mb-4 space-y-2 rounded-[18px] bg-[#e6f8ec] p-4">
                <p className="text-sm font-bold text-[#005131]">اختار دورك عشان نكمّل إعداد حسابك</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setRoleSelection('volunteer')} className="rounded-xl bg-white px-3 py-3 text-sm font-bold text-[#005131] shadow-sm">شهم</button>
                  <button type="button" onClick={() => setRoleSelection('requester')} className="rounded-xl bg-white px-3 py-3 text-sm font-bold text-[#005131] shadow-sm">مستفيد</button>
                </div>
              </div>
            )}

            <form onSubmit={(event) => { event.preventDefault(); handleGoogleLogin(); }} className="space-y-4">
              <div className="rounded-[18px] border border-[#dfe9e2] bg-white p-4 shadow-sm">
                <label className="mb-2 block text-[0.95rem] font-bold text-[#1F2430]">اسمك الأول</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="مثال: أحمد"
                  className="h-12 w-full rounded-[14px] border border-[#dfe9e2] bg-white px-4 text-[1rem] text-[#1F2430] outline-none transition focus:border-[#146B44]"
                />
              </div>

              <div className="rounded-[18px] border border-[#dfe9e2] bg-white p-4 shadow-sm">
                <label className="mb-2 block text-[0.95rem] font-bold text-[#1F2430]">رقم الجوال للتواصل</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="h-12 w-full rounded-[14px] border border-[#dfe9e2] bg-white px-4 text-[1rem] text-[#1F2430] outline-none transition focus:border-[#146B44]"
                />
              </div>

              {roleSelection === 'requester' && (
                <div className="space-y-3 rounded-[18px] border border-[#dfe9e2] bg-[#F7F8F9] p-4 shadow-sm">
                  <div className="flex items-start gap-2 text-[0.82rem] leading-[1.7] text-[#4b5f55]">
                    <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-[#146B44]" />
                    <span>بنسألك عن حالة المريض مرة واحدة بس هنا، عشان الشهم اللي هيوصّله يبقى عارف يتعامل مع حالته بحرص وأمان من أول لحظة.</span>
                  </div>

                  <div>
                    <label className="mb-2 block text-[0.95rem] font-bold text-[#1F2430]">سن المريض</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      required
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                      placeholder="مثال: 65"
                      className="h-12 w-full rounded-[14px] border border-[#dfe9e2] bg-white px-4 text-[1rem] text-[#1F2430] outline-none transition focus:border-[#146B44]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[0.95rem] font-bold text-[#1F2430]">حالة المريض الصحية باختصار</label>
                    <input
                      type="text"
                      required
                      value={patientCondition}
                      onChange={(e) => setPatientCondition(e.target.value)}
                      placeholder="مثال: غسيل كلوي، كرسي متحرك، بعد عملية..."
                      maxLength={300}
                      className="h-12 w-full rounded-[14px] border border-[#dfe9e2] bg-white px-4 text-[1rem] text-[#1F2430] outline-none transition focus:border-[#146B44]"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => (profileSetupRequired ? handleProfileSetup() : handleGoogleLogin())}
                disabled={authLoading}
                className="flex w-full items-center justify-center gap-3 rounded-[18px] border border-[#dfe9e2] bg-white px-4 py-3 text-[1rem] font-bold text-[#1F2430] shadow-sm transition hover:bg-[#F7F8F9]"
              >
                {authLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : profileSetupRequired ? null : <span className="text-[#4285F4]">G</span>}
                <span>{profileSetupRequired ? 'حفظ بيانات الحساب' : 'الدخول باستخدام Google'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const ADMIN_ROLES = ['ops_admin', 'verification_admin', 'analytics_viewer', 'super_admin'];
  const isAdmin = profile?.role && ADMIN_ROLES.includes(profile.role);
  // Per-role permissions: super_admin sees everything and is the only role
  // that can manage/delete users. ops_admin runs day-to-day operations.
  // verification_admin only reviews reports/verification. analytics_viewer
  // only sees aggregate stats.
  const canViewTrips = profile?.role && ['ops_admin', 'super_admin'].includes(profile.role);
  const canViewSafety = profile?.role && ['ops_admin', 'verification_admin', 'super_admin'].includes(profile.role);
  const canViewAnalytics = profile?.role && ['ops_admin', 'analytics_viewer', 'super_admin'].includes(profile.role);
  const canViewUsage = profile?.role && ['ops_admin', 'super_admin'].includes(profile.role);
  const canManageUsers = profile?.role === 'super_admin';
  // Fall back to the first tab this role is actually allowed to see, so a
  // role without trips access (e.g. analytics_viewer) never lands on a
  // blank screen just because 'trips' is the state's default value.
  const availableAdminTabs: Array<'trips' | 'safety' | 'analytics' | 'usage' | 'users'> = [
    ...(canViewTrips ? (['trips'] as const) : []),
    ...(canViewSafety ? (['safety'] as const) : []),
    ...(canViewAnalytics ? (['analytics'] as const) : []),
    ...(canViewUsage ? (['usage'] as const) : []),
    ...(canManageUsers ? (['users'] as const) : []),
  ];
  const effectiveAdminTab = availableAdminTabs.includes(adminTab) ? adminTab : availableAdminTabs[0];
  const showRequesterView = profile?.role === 'requester';

  // Scheduling: "now" (null) or a specific day/time up to 2 days ahead.
  const getScheduledDate = (dayOffset: number, time: string): Date | null => {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const applyDigitalTime = () => {
    const hour = Number(scheduledHour);
    const minute = Number(scheduledMinute);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setScheduledTime('');
      return;
    }
    const hour24 = scheduledPeriod === 'PM' ? (hour % 12) + 12 : hour % 12;
    setScheduledTime(`${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  };
  const scheduledDate = tripTiming === 'scheduled' ? getScheduledDate(scheduledDay, scheduledTime) : null;
  const scheduleInvalidReason =
    tripTiming === 'scheduled'
      ? !scheduledDate
        ? 'اختار وقت الرحلة'
        : scheduledDate.getTime() < Date.now()
        ? 'الوقت ده فات، اختار وقت في المستقبل'
        : scheduledDate.getTime() > Date.now() + 2 * 24 * 60 * 60 * 1000
        ? 'أقصى حجز مسموح بيه يومين قدام'
        : null
      : null;
  const showVolunteerView = profile?.role === 'volunteer' || (canViewTrips && effectiveAdminTab === 'trips');

  if (sessionUser && !['requester', 'volunteer', ...ADMIN_ROLES].includes(profile?.role)) {
    return (
      <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center p-4 text-center">
        <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#8A949E]/20 space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-[#B53A3A]" />
          <h2 className="font-bold text-[#1F2430]">الدور غير مكتمل</h2>
          <p className="text-xs text-[#6B7280]">حسابك لا يحتوي على دور صالح في جدول profiles.</p>
          <button onClick={handleSignOut} className="text-xs text-[#146B44] font-bold">تسجيل الخروج</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stitch-page flex flex-col text-right">
      {configurationNotice}
      {installNotice}

      <header className="stitch-header sticky top-0 z-40 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 min-w-0">
            <BrandMark className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#005131]">شَهْم</span>
                <span className="rounded-full bg-[#8df5b7] px-2 py-0.5 text-[11px] font-semibold text-[#005131]">متصل</span>
              </div>
              <span className="block truncate text-xs text-[#3f4942]">أهلاً، {profile?.first_name}</span>
            </div>
            <span className="text-xs bg-[#E6F4ED] text-[#146B44] px-2 py-0.5 rounded-full font-medium">
              {profile?.role === 'volunteer' ? 'شهم' : profile?.role === 'requester' ? 'مستفيد' : 'إدارة النظام'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {canInstall && (
              <button onClick={install} className="text-xs text-[#146B44] font-semibold flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />
                تثبيت التطبيق
              </button>
            )}
            <button onClick={handleSignOut} className="text-xs text-[#6B7280] hover:text-[#1F2430]">
              تسجيل الخروج
            </button>
          </div>
        </div>

        {isAdmin && (
          <div className="max-w-2xl mx-auto flex gap-2 mt-3 pt-2 border-t border-[#8A949E]/10 overflow-x-auto">
            {canViewTrips && (
              <button
                onClick={() => setAdminTab('trips')}
                className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
                  effectiveAdminTab === 'trips' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
                }`}
              >
                المشاوير الميدانية
              </button>
            )}
            {canViewSafety && (
              <button
                onClick={() => setAdminTab('safety')}
                className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
                  effectiveAdminTab === 'safety' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                البلاغات والسلامة
              </button>
            )}
            {canViewAnalytics && (
              <button
                onClick={() => setAdminTab('analytics')}
                className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
                  effectiveAdminTab === 'analytics' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                المؤشرات والتحليلات
              </button>
            )}
            {canViewUsage && (
              <button
                onClick={() => setAdminTab('usage')}
                className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
                  effectiveAdminTab === 'usage' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                استهلاك الخطة المجانية
              </button>
            )}
            {canManageUsers && (
              <button
                onClick={() => setAdminTab('users')}
                className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
                  effectiveAdminTab === 'users' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                إدارة المستخدمين
              </button>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-4 pb-28">
        {canViewSafety && effectiveAdminTab === 'safety' && <SafetyPanel />}
        {canViewAnalytics && effectiveAdminTab === 'analytics' && <AnalyticsDashboard />}
        {canViewUsage && effectiveAdminTab === 'usage' && <UsageMonitor />}
        {canManageUsers && effectiveAdminTab === 'users' && <UsersPanel />}

        {showRequesterView && activeAppTab !== 'guides' && activeAppTab !== 'account' && (
          <>
            <div className="stitch-soft-card flex items-start gap-3 p-4 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dbece0] text-[#005131]">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[#005131]">سلامتك أولاً، والناس للناس</h2>
                <p className="mt-1 text-sm leading-7 text-[#3f4942]">مشاوير مجانية بالكامل، لمساندتك في الوصول لموعدك بكرامة وأمان.</p>
              </div>
            </div>
            {reportSuccess && (
              <div className="p-3 bg-[#E6F4ED] text-[#146B44] text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>تم استلام ملاحظتك بسرية تامة وسيتم مراجعتها من قبل المشرفين.</span>
              </div>
            )}

            {activeRequesterTrip ? (
              <div className="stitch-card p-6 text-center space-y-4">
                {activeRequesterTrip.status === 'pending' ? (
                  <>
                    <div className="relative mx-auto flex h-40 w-40 items-center justify-center">
                      <div className="absolute inset-3 rounded-full border-8 border-[#dbece0]" />
                      <div className="absolute inset-3 rounded-full border-8 border-[#8df5b7] border-t-transparent animate-spin" />
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#005131] text-white shadow-lg">
                        <Clock className="h-9 w-9 animate-pulse" />
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#8df5b7]/50 px-3 py-1 text-xs font-bold text-[#005131]">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#006d41]" />
                      جارٍ البحث عن شهم قريب
                    </span>
                    <h3 className="text-xl font-bold text-[#101f17]">
                      {activeRequesterTrip.scheduled_at ? 'تم حجز الرحلة' : 'جارٍ البحث عن شهم قريب...'}
                    </h3>
                    <p className="mx-auto max-w-sm text-sm leading-7 text-[#3f4942]">
                      {activeRequesterTrip.scheduled_at
                        ? 'هنبحثلك عن شهم قريب من الموعد اللي اخترته'
                        : 'طلبك معروض الآن للشهماء على مستوى الحي لحفظ خصوصيتك'}
                    </p>
                    <div className="stitch-soft-card space-y-2 p-4 text-right text-sm">
                      <div><strong>من:</strong> {activeRequesterTrip.origin_area_label}</div>
                      <div><strong>إلى:</strong> {activeRequesterTrip.destination_area_label}</div>
                      <div>
                        <strong>الموعد:</strong>{' '}
                        {activeRequesterTrip.scheduled_at
                          ? new Date(activeRequesterTrip.scheduled_at).toLocaleString('ar-EG', {
                              weekday: 'long',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'دلوقتي (طلب عاجل)'}
                      </div>
                    </div>
                      <div className="stitch-soft-card flex items-start gap-3 p-4 text-right">
                        <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#006d41]" />
                        <div><p className="text-sm font-bold text-[#005131]">شهم موثق قريب منك</p><p className="mt-1 text-xs leading-6 text-[#3f4942]">طلبك ظاهر للشهم القريب فقط، وبيانات التواصل تظل محمية حتى القبول.</p></div>
                      </div>
                    <button
                      onClick={() => handleCancelTrip(activeRequesterTrip.id)}
                      disabled={tripActionLoading}
                      className="w-full rounded-full bg-[#dbece0] py-3 text-sm font-semibold text-[#005131] transition-colors hover:bg-[#cdded2]"
                    >
                      إلغاء الطلب
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#8df5b7] text-[#005131]">
                      <CheckCircle2 className="w-8 h-8 text-[#146B44]" />
                    </div>
                    <span className="inline-flex rounded-full bg-[#8df5b7]/60 px-3 py-1 text-xs font-bold text-[#005131]">تم التنسيق بنجاح</span>
                    <h3 className="text-xl font-bold text-[#101f17]">تم قبول طلبك!</h3>
                    <p className="text-sm leading-7 text-[#3f4942]">أحد الشهماء في طريقه إليك الآن، وستظل بيانات التواصل محمية داخل التطبيق.</p>
                    <div className="stitch-soft-card space-y-2 p-4 text-right text-sm">
                      <div><strong>من:</strong> {activeRequesterTrip.origin_area_label}</div>
                      <div><strong>إلى:</strong> {activeRequesterTrip.destination_area_label}</div>
                    </div>
                    <button
                      onClick={() => handleCompleteTrip(activeRequesterTrip.id)}
                      disabled={tripActionLoading}
                      className="stitch-primary-button w-full px-4 text-base"
                    >
                      تم الوصول بأمان ✓
                    </button>
                    <button
                      onClick={() => setReportModalOpen(true)}
                      className="text-xs text-[#6B7280] hover:text-[#B53A3A] flex items-center justify-center gap-1 mx-auto mt-2"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      إبلاغ عن مشكلة في المشوار
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="stitch-card p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#1F2430]">طلب نقل لموعد طبي</h2>

                {errorMessage && (
                  <div className="p-3 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <LocationPicker
                  label="هتتحرك منين؟"
                  placeholder="ابحث عن منطقتك أو حيك"
                  onSelect={(val) => setOrigin(val)}
                  allowCurrentLocation
                />

                <LocationPicker
                  label="هتروح فين؟"
                  placeholder="اسم المستشفى أو المركز الطبي"
                  onSelect={(val) => setDest(val)}
                />

                <div>
                  <label className="block text-sm font-semibold text-[#1F2430] mb-2">إمتى محتاج الرحلة؟</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTripTiming('now')}
                      className={`h-10 text-xs font-semibold rounded-lg border transition-colors ${
                        tripTiming === 'now'
                          ? 'border-[#146B44] bg-[#E6F4ED] text-[#146B44]'
                          : 'border-[#8A949E] bg-white text-[#1F2430]'
                      }`}
                    >
                      دلوقتي
                    </button>
                    <button
                      type="button"
                      onClick={() => setTripTiming('scheduled')}
                      className={`h-10 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1 ${
                        tripTiming === 'scheduled'
                          ? 'border-[#146B44] bg-[#E6F4ED] text-[#146B44]'
                          : 'border-[#8A949E] bg-white text-[#1F2430]'
                      }`}
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      حجز موعد
                    </button>
                  </div>

                  {tripTiming === 'scheduled' && (
                    <div className="mt-2 p-3 bg-[#F7F8F9] rounded-xl border border-[#8A949E]/30 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { d: 0 as const, l: 'النهاردة' },
                          { d: 1 as const, l: 'بكرة' },
                          { d: 2 as const, l: 'بعد بكرة' },
                        ].map((opt) => (
                          <button
                            key={opt.d}
                            type="button"
                            onClick={() => setScheduledDay(opt.d)}
                            className={`h-9 text-xs font-semibold rounded-lg border transition-colors ${
                              scheduledDay === opt.d
                                ? 'border-[#146B44] bg-white text-[#146B44]'
                                : 'border-[#8A949E] bg-white text-[#1F2430]'
                            }`}
                          >
                            {opt.l}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input type="number" min={1} max={12} value={scheduledHour} onChange={(event) => setScheduledHour(event.target.value)} placeholder="الساعة" className="h-11 rounded-xl border border-[#8A949E] bg-white px-3 text-sm" />
                        <select value={scheduledMinute} onChange={(event) => setScheduledMinute(event.target.value)} className="h-11 rounded-xl border border-[#8A949E] bg-white px-3 text-sm">
                          {Array.from({ length: 60 }, (_, minute) => <option key={minute} value={String(minute).padStart(2, '0')}>{String(minute).padStart(2, '0')}</option>)}
                        </select>
                        <select value={scheduledPeriod} onChange={(event) => setScheduledPeriod(event.target.value as 'AM' | 'PM')} className="h-11 rounded-xl border border-[#8A949E] bg-white px-3 text-sm"><option>AM</option><option>PM</option></select>
                      </div>
                      <button type="button" onClick={applyDigitalTime} className="h-10 w-full rounded-xl bg-[#146B44] text-sm font-semibold text-white">تعيين</button>
                      {scheduledTime && <p className="text-xs text-[#146B44]">الوقت المحدد: {scheduledTime}</p>}
                      {scheduleInvalidReason && (
                        <p className="text-xs text-[#B53A3A]">{scheduleInvalidReason}</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#1F2430] mb-2">الطلب ده لـ:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'patient', label: 'أنا' },
                      { id: 'guardian', label: 'شخص تحت رعايتي' },
                      { id: 'companion', label: 'مرافقة شخص' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setRelation(item.id as RequesterRelation)}
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

                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#1F2430]">عدد الأفراد</label>
                  <select value={passengerCount} onChange={(event) => setPassengerCount(Number(event.target.value))} className="h-11 w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm text-[#1F2430]">
                    {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#1F2430]">ملاحظات</label>
                  <textarea value={specialNotes} onChange={(event) => setSpecialNotes(event.target.value)} maxLength={500} placeholder="مثال: كرسي متحرك، عكاز، شنط، احتياجات خاصة..." className="min-h-20 w-full rounded-xl border border-[#8A949E] bg-white p-3 text-sm text-[#1F2430] focus:border-[#146B44] focus:outline-none" />
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
                      أقر بأن هذا الطلب لحالة علاجية حقيقية، وأتحمل المسؤولية الكاملة عن دقة البيانات المُدخلة.
                    </span>
                  </label>
                </div>

                <button
                  disabled={!origin || !dest || !ackChecked || createTripLoading || (tripTiming === 'scheduled' && !!scheduleInvalidReason)}
                  onClick={handleCreateTrip}
                  className="w-full h-[52px] bg-[#146B44] disabled:opacity-40 active:bg-[#0F5636] text-white font-semibold rounded-xl text-base transition-colors flex items-center justify-center gap-2"
                >
                  {createTripLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إرسال الطلب الآن'}
                </button>
              </div>
            )}
          </>
        )}

        {profile?.role === 'volunteer' && activeAppTab === 'request' && (
          <section className="stitch-card space-y-4 p-5">
            <div className="stitch-soft-card flex items-start gap-3 p-4"><Handshake className="mt-1 h-5 w-5 shrink-0 text-[#005131]" /><div><h2 className="font-bold text-[#005131]">طلب عون</h2><p className="mt-1 text-sm leading-7 text-[#3f4942]">لو عربيتك عطلت أو عندك مشكلة على الطريق، اطلب مساعدة من الشهم القريب منك.</p></div></div>
            {assistanceSuccess && <div className="rounded-xl bg-[#E6F4ED] p-3 text-sm text-[#146B44]">تم إرسال طلب العون.</div>}
            <select value={assistanceType} onChange={(event) => setAssistanceType(event.target.value)} className="h-11 w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm">
              <option value="tire">كاوتش</option><option value="fuel">بنزين</option><option value="battery">بطارية</option><option value="water">مياه</option><option value="breakdown">عطل في العربية</option><option value="other">أخرى</option>
            </select>
            <textarea value={assistanceDescription} onChange={(event) => setAssistanceDescription(event.target.value)} maxLength={1000} placeholder="اكتب المشكلة بالتفصيل..." className="min-h-28 w-full rounded-xl border border-[#8A949E] bg-white p-3 text-sm" />
            <button type="button" onClick={handleCreateAssistanceRequest} disabled={assistanceLoading} className="stitch-primary-button w-full px-4 text-sm">{assistanceLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'إرسال طلب عون'}</button>
          </section>
        )}

        {showVolunteerView && activeAppTab === 'trips' && (
          <>
            <div className="stitch-soft-card flex items-start gap-3 p-4 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#146b44] text-white">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[#005131]">أهلاً بك يا بطل الخير</h2>
                <p className="mt-1 text-sm leading-7 text-[#3f4942]">مشوارك البسيط يصنع فارقاً عظيماً في رحلة علاج إنسان يحتاجك اليوم.</p>
              </div>
            </div>
            {raceConditionDetected && (
              <RaceConditionToast onClose={() => setRaceConditionDetected(false)} />
            )}

            {activeVolunteerTripData ? (
              <div className="stitch-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#8df5b7]/60 px-3 py-1 text-xs font-semibold text-[#005131]">
                    تم التنسيق بنجاح
                  </span>
                  <ShieldCheck className="w-5 h-5 text-[#146B44]" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-[#101f17]">{activeVolunteerTripData.requester_first_name}</h3>
                  <p className="text-sm text-[#3f4942]">
                    {activeVolunteerTripData.requester_relation === 'patient' && 'مريض'}
                    {activeVolunteerTripData.requester_relation === 'guardian' && 'ولي أمر'}
                    {activeVolunteerTripData.requester_relation === 'companion' && 'مرافق'}
                  </p>
                </div>

                <div className="stitch-soft-card space-y-2 p-4 text-right text-sm">
                  <div><strong>نقطة الانطلاق:</strong> {activeVolunteerTripData.origin_address}</div>
                  <div><strong>الوجهة:</strong> {activeVolunteerTripData.destination_address}</div>
                  <div><strong>عدد الأفراد:</strong> {activeVolunteerTripData.passenger_count ?? 1}</div>
                  {activeVolunteerTripData.special_notes && <div><strong>ملاحظات:</strong> {activeVolunteerTripData.special_notes}</div>}
                </div>

                <div className="stitch-soft-card space-y-3 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#005131]"><Route className="h-5 w-5" />مسار المشوار ونقطة اللقاء</div>
                  <div className="space-y-3 border-r-2 border-[#bfc9bf] pr-4 text-sm">
                    <div className="relative"><span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#8df5b7] ring-4 ring-[#e6f8ec]" /><span className="block text-xs text-[#6f7a71]">نقطة الانطلاق</span><span className="block font-semibold text-[#101f17]">{activeVolunteerTripData.origin_address}</span></div>
                    <div className="relative"><span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#146b44] ring-4 ring-[#e6f8ec]" /><span className="block text-xs text-[#6f7a71]">الوجهة الطبية</span><span className="block font-semibold text-[#101f17]">{activeVolunteerTripData.destination_address}</span></div>
                  </div>
                </div>

                <div className="stitch-soft-card flex items-start gap-2 p-4 text-sm leading-7 text-[#3f4942]"><HeartHandshake className="mt-1 h-5 w-5 shrink-0 text-[#005131]" /><span><strong className="text-[#005131]">همسة شَهْم للطريق:</strong> كن عونًا وصبورًا، واجعل الابتسامة رفيقة الطريق.</span></div>

                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={`tel:${activeVolunteerTripData.requester_phone}`}
                    className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#146B44] text-xs font-semibold text-white active:bg-[#0F5636]"
                  >
                    <Phone className="w-4 h-4" />
                    اتصال
                  </a>
                  <a
                    href={`https://wa.me/${toWhatsAppNumber(activeVolunteerTripData.requester_phone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#1E8E5A] text-xs font-semibold text-white active:bg-[#0F5636]"
                  >
                    <MessageSquare className="w-4 h-4" />
                    واتساب
                  </a>
                  <a
                    href={`https://maps.google.com/?q=${activeVolunteerTripData.origin_lat},${activeVolunteerTripData.origin_lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#2F6FED] text-xs font-semibold text-white"
                  >
                    <Map className="w-4 h-4" />
                    الخرائط
                  </a>
                </div>

                <button
                  onClick={() => handleCompleteTrip(activeVolunteerTripData.trip_id)}
                  disabled={tripActionLoading}
                  className="stitch-primary-button w-full text-base active:bg-[#0F5636] transition-colors"
                >
                  ✓ تم إيصاله بأمان
                </button>

                <button
                  onClick={() => setReportModalOpen(true)}
                  className="text-xs text-[#6B7280] hover:text-[#B53A3A] flex items-center justify-center gap-1 mx-auto"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  إبلاغ عن مشكلة
                </button>
              </div>
            ) : profile?.role === 'volunteer' && volunteerLocationStatus !== 'ready' ? (
              <div className="stitch-card p-8 text-center space-y-3">
                <LocateFixed className="w-8 h-8 text-[#146B44] mx-auto" />
                <p className="text-sm font-semibold text-[#1F2430]">محتاجين نعرف موقعك الحالي</p>
                <p className="text-xs text-[#6B7280]">
                  عشان نطلعلك الطلبات القريبة منك
                </p>
                {volunteerLocationError && (
                  <p className="text-xs text-[#B53A3A]">{volunteerLocationError}</p>
                )}
                <button
                  onClick={requestVolunteerLocation}
                  disabled={volunteerLocationStatus === 'loading'}
                  className="h-11 px-5 bg-[#146B44] text-white rounded-xl text-sm font-semibold flex items-center gap-2 mx-auto disabled:opacity-50"
                >
                  {volunteerLocationStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                  تفعيل الموقع
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-base font-bold text-[#1F2430] flex items-center justify-between">
                  <span>الطلبات المتاحة قربك</span>
                  <span className="text-xs font-normal text-[#6B7280]">({pendingTrips.length})</span>
                </h2>

                {pendingTrips.length === 0 ? (
                  <div className="stitch-card p-8 text-center space-y-2">
                    <Clock className="w-8 h-8 text-[#8A949E] mx-auto" />
                    <p className="text-sm font-semibold text-[#1F2430]">مفيش طلبات قريبة منك دلوقتي</p>
                    <p className="text-xs text-[#6B7280]">هنبلغك أول ما يظهر طلب جديد في منطقتك</p>
                  </div>
                ) : (
                  pendingTrips.map((trip) => (
                    <div
                      key={trip.id}
                      onClick={() => setSelectedTripDetails(trip)}
                      className="stitch-card p-4 cursor-pointer hover:border-[#146B44] transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs text-[#6B7280] flex-wrap gap-1">
                        <span className="bg-[#FBEFDC] text-[#8F5A0A] px-2 py-0.5 rounded-md font-medium">
                          {trip.requester_relation === 'patient' && 'مريض'}
                          {trip.requester_relation === 'guardian' && 'ولي أمر'}
                          {trip.requester_relation === 'companion' && 'مرافق'}
                        </span>
                        <div className="flex items-center gap-2">
                          {typeof trip.distance_km === 'number' && (
                            <span className="flex items-center gap-1 font-semibold text-[#146B44]">
                              <Navigation className="w-3 h-3" />
                              {trip.distance_km} كم
                            </span>
                          )}
                          <span>
                            {trip.scheduled_at
                              ? new Date(trip.scheduled_at).toLocaleString('ar-EG', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
                              : new Date(trip.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="text-sm font-bold text-[#1F2430] flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#146B44] shrink-0" />
                        <span>{trip.origin_area_label}</span>
                        <span className="text-[#6B7280]">⟶</span>
                        <span>{trip.destination_area_label}</span>
                      </div>

                      <div className="text-xs text-[#3f4942]">عدد الأفراد: {trip.passenger_count ?? 1}</div>
                      {trip.special_notes && <div className="rounded-lg bg-[#F7F8F9] px-2 py-1.5 text-xs text-[#3f4942]">ملاحظات: {trip.special_notes}</div>}

                      <div className="flex items-center gap-1.5 rounded-lg bg-[#e6f8ec] px-2 py-1.5 text-xs text-[#005131]"><ShieldCheck className="h-3.5 w-3.5" /><span>بيانات الحالة تظهر بعد قبول المشوار فقط</span></div>
                    </div>
                  ))
                )}
              </div>
            )}

            {selectedTripDetails && (
              <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[#25342c]/45 backdrop-blur-sm" role="dialog" aria-modal="true">
                <div className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-[#ecfef1] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
                  <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#bfc9bf]" />
                  <div className="stitch-soft-card relative overflow-hidden p-4">
                    <div className="relative z-10 flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#146b44] text-white"><HeartHandshake className="h-6 w-6" /></div>
                      <div><h3 className="text-lg font-bold text-[#005131]">طلب مشوار علاجي بانتظار شهامتك</h3><p className="mt-1 text-sm leading-7 text-[#3f4942]">مشوارك الطيب يخفف عن مريض ومرافقه مشقة الطريق.</p></div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="stitch-card p-3 text-center"><Navigation className="mx-auto h-5 w-5 text-[#005131]" /><span className="mt-1 block text-[11px] text-[#3f4942]">المسافة إليك</span><strong className="block text-sm text-[#101f17]">{selectedTripDetails.distance_km ?? '--'} كم</strong><span className="text-[11px] text-[#006d41]">نطاق معتمد</span></div>
                    <div className="stitch-card p-3 text-center"><Clock className="mx-auto h-5 w-5 text-[#006d41]" /><span className="mt-1 block text-[11px] text-[#3f4942]">وقت الوصول</span><strong className="block text-sm text-[#101f17]">قريبًا</strong><span className="text-[11px] text-[#3f4942]">بالمركبة</span></div>
                    <div className="stitch-card p-3 text-center"><HeartPulse className="mx-auto h-5 w-5 text-[#8f4c00]" /><span className="mt-1 block text-[11px] text-[#3f4942]">نوع الطلب</span><strong className="block text-sm text-[#8f4c00]">{selectedTripDetails.scheduled_at ? 'موعد' : 'مباشر'}</strong><span className="text-[11px] text-[#3f4942]">علاجي</span></div>
                  </div>

                  <div className="stitch-card mt-3 space-y-4 p-4">
                    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Route className="h-5 w-5 text-[#005131]" /><h3 className="font-bold text-[#101f17]">مسار المشوار التقديري</h3></div><span className="rounded-full bg-[#dbece0] px-2 py-1 text-[11px] text-[#3f4942]">خصوصية محفوظة</span></div>
                    <div className="space-y-3 border-r-2 border-[#dbece0] pr-4">
                      <div className="relative"><span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#8df5b7] ring-4 ring-[#ecfef1]" /><span className="block text-xs font-semibold text-[#006d41]">نقطة الانطلاق التقديرية</span><span className="block text-sm font-semibold text-[#101f17]">{selectedTripDetails.origin_area_label}</span><span className="block text-xs leading-6 text-[#6f7a71]">يُكشف العنوان التفصيلي بعد القبول فقط.</span></div>
                      <div className="relative"><span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#146b44] ring-4 ring-[#ecfef1]" /><span className="block text-xs font-semibold text-[#005131]">الوجهة الطبية المعتمدة</span><span className="block text-sm font-semibold text-[#101f17]">{selectedTripDetails.destination_area_label}</span></div>
                    </div>
                  </div>

                  <div className="stitch-card mt-3 space-y-3 p-4">
                    <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#005131]" /><h3 className="font-bold text-[#101f17]">بيانات المشوار المعتمدة</h3></div>
                    <div className="flex items-start gap-2 rounded-xl bg-[#e1f2e6] p-3 text-xs leading-6 text-[#3f4942]"><LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-[#005131]" />بيانات الحالة والعنوان ورقم التواصل تظل مخفية حتى قبول المشوار حفاظًا على خصوصية المستفيد.</div>
                    <div className="text-sm text-[#3f4942]"><strong>عدد الأفراد:</strong> {selectedTripDetails.passenger_count ?? 1}</div>
                    {selectedTripDetails.special_notes && <div className="rounded-xl bg-[#F7F8F9] p-3 text-sm leading-6 text-[#3f4942]"><strong>ملاحظات:</strong> {selectedTripDetails.special_notes}</div>}
                  </div>

                  <div className="mt-3 flex flex-col gap-2"><button disabled={acceptingTripId === selectedTripDetails.id} onClick={() => handleAcceptTrip(selectedTripDetails.id)} className="stitch-primary-button flex w-full items-center justify-center gap-2 px-4 text-base">{acceptingTripId === selectedTripDetails.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Handshake className="h-5 w-5" />مساعدة هذا الشخص وقبول المشوار</>}</button><button type="button" onClick={() => setSelectedTripDetails(null)} className="py-2 text-sm font-semibold text-[#3f4942] underline underline-offset-4">الرجوع إلى قائمة الطلبات المتاحة</button></div>
                </div>
              </div>
            )}
          </>
        )}

        {activeAppTab === 'guides' && (
          <section className="space-y-4">
            <div className="stitch-soft-card flex items-start gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dbece0] text-[#005131]"><Shield className="h-5 w-5" /></div>
              <div><h2 className="text-lg font-bold text-[#005131]">إرشادات شَهْم</h2><p className="mt-1 text-sm leading-7 text-[#3f4942]">نحافظ على خصوصية المرضى وننسّق كل مشوار بهدوء وكرامة.</p></div>
            </div>
            {['العنوان ورقم الهاتف لا يظهران قبل قبول المشوار.', 'احترم الموعد وتواصل بلطف مع الطرف الآخر.', 'أي بلاغ تتم مراجعته بسرية من فريق الأمان.'].map((text, index) => (
              <div key={text} className="stitch-card flex items-start gap-3 p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e6f8ec] text-[#005131] text-sm font-bold">{index + 1}</div>
                <p className="text-sm leading-7 text-[#3f4942]">{text}</p>
              </div>
            ))}
          </section>
        )}

        {activeAppTab === 'account' && (
          <section className="space-y-4">
            <div className="stitch-card flex items-center gap-3 p-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#146b44] text-white"><UserRoundCheck className="h-7 w-7" /></div>
              <div><p className="text-xs text-[#3f4942]">حساب شَهْم</p><h2 className="text-xl font-bold text-[#101f17]">{profile?.first_name}</h2><p className="text-sm text-[#005131]">{profile?.role === 'volunteer' ? 'شهم متطوع' : 'مستفيد'}</p></div>
            </div>
            <div className="stitch-soft-card flex items-start gap-3 p-4"><LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-[#005131]" /><p className="text-sm leading-7 text-[#3f4942]">بياناتك محفوظة ولا يتم كشف معلومات التواصل إلا عند الحاجة وبحسب حالة المشوار.</p></div>
            <button type="button" onClick={handleSignOut} className="w-full rounded-full bg-[#fceaea] py-3 font-semibold text-[#b53a3a]">تسجيل الخروج</button>
          </section>
        )}

        <ReportModal
          tripId={activeVolunteerTripData?.trip_id || activeRequesterTrip?.id}
          reportedProfileId={activeVolunteerTripData?.requester_id}
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          onSuccess={() => setReportSuccess(true)}
        />
      </main>
      {!isAdmin && <StitchBottomNav active={activeAppTab} onChange={setActiveAppTab} showRequest={profile?.role === 'volunteer'} />}
    </div>
  );
};

export default App;
