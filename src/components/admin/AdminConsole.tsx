import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, UserRole } from '../../lib/supabase';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { SafetyPanel } from './SafetyPanel';
import {
  Activity, AlertTriangle, BarChart3, ChevronLeft, CircleUserRound,
  Clock3, LoaderCircle, MailPlus, RefreshCw, Search, Shield, ShieldCheck,
  ShieldPlus, Users,
} from 'lucide-react';

type Section = 'overview' | 'trips' | 'people' | 'reports' | 'analytics' | 'activity' | 'supervisors';
type AdminProfile = {
  id: string;
  first_name: string;
  phone_number: string;
  role: UserRole;
  is_active: boolean;
  verification_status: string;
  created_at: string;
};
type AdminAudit = {
  id: string;
  actor_id: string | null;
  action: string;
  target_profile_id: string | null;
  reason: string | null;
  created_at: string;
};
type Kpis = {
  total_users: number;
  total_volunteers: number;
  total_requesters: number;
  total_trips: number;
  completed_trips: number;
  cancelled_trips: number;
  completion_rate: number;
  cancellation_rate: number;
};
type AdminTrip = {
  id: string;
  requester_id: string;
  volunteer_id: string | null;
  origin_area_label: string;
  destination_area_label: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'expired';
  requester_relation: string;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
};

const roleLabels: Record<UserRole, string> = {
  volunteer: 'شهم', requester: 'مريض / طالب مساعدة', ops_admin: 'مشرف تشغيل',
  verification_admin: 'مشرف توثيق', analytics_viewer: 'مشرف تقارير', super_admin: 'مدير عام',
};
const navItems: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'الرئيسية', icon: BarChart3 },
  { id: 'trips', label: 'الرحلات', icon: Activity },
  { id: 'people', label: 'المستخدمون', icon: Users },
  { id: 'reports', label: 'البلاغات', icon: AlertTriangle },
  { id: 'analytics', label: 'التقارير', icon: Activity },
  { id: 'activity', label: 'سجل الإدارة', icon: Clock3 },
];

const formatDate = (value: string) => new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
const shortId = (value: string) => `${value.slice(0, 8)}…`;

export const AdminConsole: React.FC<{ role: UserRole }> = ({ role }) => {
  const canManagePeople = role === 'ops_admin' || role === 'super_admin';
  const canOperate = role === 'ops_admin' || role === 'super_admin';
  const isSuperAdmin = role === 'super_admin';
  const items = useMemo(() => [
    ...navItems.filter((item) => (item.id !== 'people' || canManagePeople) && (item.id !== 'trips' || canOperate) && (item.id !== 'reports' || role !== 'analytics_viewer') && (item.id !== 'activity' || canOperate)),
    ...(isSuperAdmin ? [{ id: 'supervisors' as const, label: 'المشرفون', icon: ShieldPlus }] : []),
  ], [canManagePeople, canOperate, isSuperAdmin, role]);
  const [section, setSection] = useState<Section>('overview');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [reportCount, setReportCount] = useState<number | null>(null);
  const [pendingReportCount, setPendingReportCount] = useState<number | null>(null);
  const [pendingTripCount, setPendingTripCount] = useState<number | null>(null);
  const [activeTripCount, setActiveTripCount] = useState<number | null>(null);
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [auditRows, setAuditRows] = useState<AdminAudit[]>([]);
  const [trips, setTrips] = useState<AdminTrip[]>([]);
  const [tripNames, setTripNames] = useState<Record<string, string>>({});
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState<'ops_admin' | 'verification_admin' | 'analytics_viewer'>('ops_admin');
  const [notice, setNotice] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    const kpiResult = await supabase.rpc('get_analytics_kpis');
    if (kpiResult.error) setError('تعذر تحميل مؤشرات الإدارة. تحقق من تطبيق ترحيلات التحليلات.');
    setKpis((kpiResult.data?.[0] as Kpis | undefined) ?? null);
    if (role === 'analytics_viewer') {
      setReportCount(null); setPendingReportCount(null); setPendingTripCount(null); setActiveTripCount(null); setAdminCount(null); setAuditRows([]);
      setLoading(false);
      return;
    }
    const [reportResult, pendingResult] = await Promise.all([
      supabase.from('reports').select('id', { count: 'exact', head: true }),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    if (reportResult.error || pendingResult.error) setError('تعذر تحميل مؤشرات البلاغات. تحقق من ترحيلات الإدارة.');
    setReportCount(reportResult.count ?? 0);
    setPendingReportCount(pendingResult.count ?? 0);
    if (!canOperate) {
      setPendingTripCount(null); setActiveTripCount(null); setAdminCount(null); setAuditRows([]);
      setLoading(false);
      return;
    }
    // Counts and audit entries use narrow admin RPCs: table-wide grants would expose
    // trip columns to every authenticated user even though RLS hides unrelated rows.
    const [metricsResult, auditResult] = await Promise.all([
      supabase.rpc('get_admin_dashboard_counts'),
      supabase.rpc('get_admin_audit_logs', { p_limit: 6 }),
    ]);
    const firstError = metricsResult.error || auditResult.error;
    if (firstError) {
      console.error('Admin dashboard read failed:', firstError);
      setError('تعذر تحميل بعض بيانات الإدارة. تحقق من صلاحية الإدارة ثم أعد المحاولة.');
    }
    const metrics = metricsResult.data?.[0];
    setAdminCount(metrics?.active_admins ?? null);
    setPendingTripCount(metrics?.pending_trips ?? null);
    setActiveTripCount(metrics?.active_trips ?? null);
    setAuditRows((auditResult.data as AdminAudit[] | null) ?? []);
    setLoading(false);
  }, [role]);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id,first_name,phone_number,role,is_active,verification_status,created_at')
      .in('role', ['volunteer', 'requester'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (loadError) setError('تعذر تحميل المستخدمين. تأكد من أن الدور مخوّل لإدارة الحسابات.');
    setProfiles((data as AdminProfile[] | null) ?? []);
    setLoading(false);
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError('');
    // The RPC returns only audit fields and checks the operations-admin role server-side.
    const { data, error: loadError } = await supabase.rpc('get_admin_audit_logs', { p_limit: 100 });
    if (loadError) {
      console.error('Admin audit log read failed:', loadError);
      setError('تعذر تحميل سجل الإدارة. تحقق من صلاحية الإدارة ثم أعد المحاولة.');
    }
    setAuditRows((data as AdminAudit[] | null) ?? []);
    setLoading(false);
  }, []);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError('');
    // Use an admin-only RPC so the dashboard never needs broad SELECT on trips.
    const { data, error: loadError } = await supabase.rpc('get_admin_trips', { p_limit: 100 });
    if (loadError) {
      console.error('Admin trip list read failed:', loadError);
      setError('تعذر تحميل سجل الرحلات. تحقق من صلاحية الإدارة ثم أعد المحاولة.');
      setTrips([]);
      setLoading(false);
      return;
    }
    const rows = (data as AdminTrip[] | null) ?? [];
    setTrips(rows);
    const profileIds = [...new Set(rows.flatMap((trip) => [trip.requester_id, trip.volunteer_id].filter((id): id is string => Boolean(id))))];
    if (profileIds.length) {
      const { data: profileData } = await supabase.from('profiles').select('id,first_name').in('id', profileIds);
      setTripNames(Object.fromEntries((profileData ?? []).map((person) => [person.id, person.first_name])));
    } else setTripNames({});
    setLoading(false);
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => {
    if (section === 'people') void loadProfiles();
    if (section === 'activity') void loadAudit();
    if (section === 'trips') void loadTrips();
  }, [section, loadAudit, loadProfiles, loadTrips]);

  const filteredTrips = useMemo(() => trips.filter((trip) =>
    (tripStatusFilter === 'all' || trip.status === tripStatusFilter)
      && `${trip.origin_area_label} ${trip.destination_area_label} ${tripNames[trip.requester_id] ?? ''} ${tripNames[trip.volunteer_id ?? ''] ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  ), [trips, tripStatusFilter, search, tripNames]);

  const filteredProfiles = useMemo(() => profiles.filter((person) => {
    const query = search.trim().toLocaleLowerCase();
    return (roleFilter === 'all' || person.role === roleFilter)
      && (!query || person.first_name.toLocaleLowerCase().includes(query) || person.phone_number.includes(query) || person.id.includes(query));
  }), [profiles, roleFilter, search]);

  const setProfileActive = async (person: AdminProfile) => {
    const reason = prompt(person.is_active ? 'اكتب سبب إيقاف الحساب لتوثيقه في سجل الإدارة:' : 'اكتب سبب إعادة تفعيل الحساب:');
    if (!reason?.trim()) return;
    setBusyId(person.id);
    setNotice('');
    const { error: actionError } = await supabase.rpc('set_profile_active', {
      p_target_profile_id: person.id,
      p_is_active: !person.is_active,
      p_reason: reason.trim(),
    });
    setBusyId('');
    if (actionError) { setNotice(actionError.message); return; }
    setNotice(person.is_active ? 'تم إيقاف الحساب وتوثيق السبب.' : 'تمت إعادة تفعيل الحساب وتوثيق الإجراء.');
    await Promise.all([loadProfiles(), loadOverview()]);
  };

  const loadSupervisors = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: loadError } = await supabase.from('profiles')
      .select('id,first_name,phone_number,role,is_active,verification_status,created_at')
      .in('role', ['ops_admin', 'verification_admin', 'analytics_viewer', 'super_admin'])
      .order('created_at', { ascending: false });
    if (loadError) setError('تعذر تحميل قائمة المشرفين.');
    setProfiles((data as AdminProfile[] | null) ?? []);
    setLoading(false);
  }, []);

  const inviteSupervisor = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyId('invite');
    setNotice('');
    const { data, error: inviteError } = await supabase.functions.invoke('manage-admin-users', {
      body: { action: 'invite', first_name: inviteName.trim(), email: inviteEmail.trim(), phone_number: invitePhone.trim(), role: inviteRole },
    });
    setBusyId('');
    if (inviteError || data?.error) {
      setNotice(data?.error ?? inviteError?.message ?? 'تعذر إرسال الدعوة.');
      return;
    }
    setInviteName(''); setInviteEmail(''); setInvitePhone(''); setInviteOpen(false);
    setNotice(data?.invitation_sent
      ? 'أرسلنا دعوة للمشرف الجديد إلى بريده الإلكتروني. لن يتمكن من الدخول قبل إكمال التسجيل.'
      : 'أُضيفت صلاحية المشرف للحساب الموجود. على صاحبه إعادة تحميل التطبيق أو تسجيل الدخول مجددًا، ثم اختيار دور الإدارة من صفحة «حسابي».');
    await Promise.all([loadOverview(), loadSupervisors()]);
  };

  const changeSupervisorStatus = async (person: AdminProfile) => {
    const reason = prompt(person.is_active ? 'سبب إيقاف صلاحية المشرف:' : 'سبب إعادة تفعيل صلاحية المشرف:');
    if (!reason?.trim()) return;
    setBusyId(person.id);
    const { data, error: actionError } = await supabase.functions.invoke('manage-admin-users', {
      body: { action: 'set_active', profile_id: person.id, is_active: !person.is_active, reason: reason.trim() },
    });
    setBusyId('');
    if (actionError || data?.error) { setNotice(data?.error ?? actionError?.message ?? 'تعذر تحديث صلاحيات المشرف.'); return; }
    setNotice(person.is_active ? 'تم إيقاف صلاحيات المشرف.' : 'تمت إعادة تفعيل صلاحيات المشرف.');
    await loadSupervisors();
  };

  useEffect(() => { if (section === 'supervisors' && isSuperAdmin) void loadSupervisors(); }, [section, isSuperAdmin, loadSupervisors]);

  const summaryCards = [
    { title: 'ملفات المستخدمين', value: kpis?.total_users, detail: `${kpis?.total_volunteers ?? 0} شهم · ${kpis?.total_requesters ?? 0} طالب مساعدة`, icon: Users, color: 'text-emerald-700 bg-emerald-50' },
    { title: 'الرحلات', value: kpis?.total_trips, detail: pendingTripCount === null ? 'مؤشرات إجمالية فقط' : `${pendingTripCount} جديدة · ${activeTripCount} جارية`, icon: Activity, color: 'text-sky-700 bg-sky-50' },
    { title: 'بلاغات قيد المراجعة', value: pendingReportCount ?? '—', detail: reportCount === null ? 'غير متاح لهذا الدور' : `${reportCount} بلاغ إجمالًا`, icon: AlertTriangle, color: 'text-amber-700 bg-amber-50' },
    { title: 'المشرفون النشطون', value: adminCount ?? '—', detail: adminCount === null ? 'غير متاح لهذا الدور' : 'بحسب صلاحيات قاعدة البيانات', icon: ShieldCheck, color: 'text-violet-700 bg-violet-50' },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 rounded-3xl border border-[#146B44]/10 bg-[#F8FBF9] p-3 text-right shadow-sm sm:p-5" dir="rtl" aria-label="مركز إدارة شهم">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-bl from-[#064B32] via-[#0C6844] to-[#138254] p-5 text-white shadow-lg sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold"><Shield className="h-4 w-4" /> مركز قيادة شهم</div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">الإدارة والمتابعة</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">لوحة واحدة لمتابعة الخدمة، سلامة المجتمع، الحسابات، وأداء الرحلات من بيانات المشروع الفعلية.</p>
          </div>
          <button type="button" onClick={() => { void loadOverview(); if (section === 'people') void loadProfiles(); if (section === 'activity') void loadAudit(); if (section === 'trips') void loadTrips(); if (section === 'supervisors') void loadSupervisors(); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 hover:bg-white/20" aria-label="تحديث اللوحة"><RefreshCw className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-white/85">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">الدور: {roleLabels[role]}</span>
          {kpis && <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">إنجاز الرحلات {kpis.completion_rate ?? 0}%</span>}
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">متابعة موثقة بسجل الإدارة</span>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-[#DCE8E0] bg-white p-2" aria-label="أقسام مركز الإدارة">
        {items.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => { setSection(id); setNotice(''); }} className={'flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold transition ' + (section === id ? 'bg-[#0B6742] text-white shadow-sm' : 'bg-[#F6F8F6] text-[#53645a] hover:bg-[#E6F4ED]')}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-2xl border border-[#BDE4CD] bg-[#EAF7EF] p-3 text-sm text-[#075C3A]">{notice}</div>}
      {loading && section !== 'analytics' && section !== 'reports' ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-[#65736A]"><LoaderCircle className="mx-auto mb-2 h-6 w-6 animate-spin text-[#146B44]" />جارٍ تحميل البيانات</div> : null}

      {section === 'overview' && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {summaryCards.map(({ title, value, detail, icon: Icon, color }) => <article key={title} className="rounded-2xl border border-[#E1EAE4] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#65736A]">{title}</span><span className={'grid h-9 w-9 place-items-center rounded-xl ' + color}><Icon className="h-4 w-4" /></span></div>
              <strong className="mt-3 block text-3xl font-black tabular-nums text-[#173628]">{value ?? '—'}</strong><p className="mt-1 text-[11px] text-[#748078]">{detail}</p>
            </article>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-[#E1EAE4] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><div><h3 className="font-bold text-[#173628]">صورة الخدمة</h3><p className="mt-1 text-xs text-[#748078]">ملخص من قاعدة البيانات مباشرة</p></div><Activity className="h-5 w-5 text-[#168150]" /></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#F4F8F5] p-3"><span className="text-xs text-[#65736A]">نسبة إتمام الرحلات</span><strong className="mt-1 block text-2xl font-black text-[#0B6742]">{kpis?.completion_rate ?? '—'}%</strong></div>
                <div className="rounded-xl bg-[#F4F8F5] p-3"><span className="text-xs text-[#65736A]">نسبة إلغاء الرحلات</span><strong className="mt-1 block text-2xl font-black text-[#A34236]">{kpis?.cancellation_rate ?? '—'}%</strong></div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E8EEEA]"><div className="h-full rounded-full bg-[#18A566] transition-all" style={{ width: `${Math.min(100, Math.max(0, Number(kpis?.completion_rate ?? 0)))}%` }} /></div>
            </article>
            <article className="rounded-2xl border border-[#E1EAE4] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><div><h3 className="font-bold text-[#173628]">آخر إجراءات الإدارة</h3><p className="mt-1 text-xs text-[#748078]">آخر 6 إجراءات مسجلة</p></div><Clock3 className="h-5 w-5 text-[#168150]" /></div>
              {auditRows.length ? <ul className="mt-3 divide-y divide-[#EEF2EF]">{auditRows.map((row) => <li key={row.id} className="flex items-start justify-between gap-3 py-3"><span className="min-w-0"><strong className="block truncate text-xs text-[#26382E]">{row.action}</strong>{row.reason && <span className="mt-1 block truncate text-[11px] text-[#78837C]">{row.reason}</span>}</span><time className="shrink-0 text-[10px] text-[#89938C]">{formatDate(row.created_at)}</time></li>)}</ul> : <p className="mt-5 rounded-xl bg-[#F5F8F6] p-4 text-center text-xs text-[#748078]">لا توجد إجراءات مسجلة بعد.</p>}
              <button onClick={() => setSection('activity')} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#0B6742]">فتح سجل الإدارة <ChevronLeft className="h-4 w-4" /></button>
            </article>
          </div>
        </>
      )}

      {section === 'trips' && !loading && <div className="space-y-4 rounded-2xl border border-[#E1EAE4] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-[#173628]">متابعة الرحلات</h3><p className="mt-1 text-xs text-[#748078]">عرض إداري للطلبات وحالاتها مع الحفاظ على سجل القرارات.</p></div><span className="rounded-full bg-[#E6F4ED] px-3 py-1 text-xs font-bold text-[#0B6742]">آخر {trips.length} رحلة</span></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_190px]"><label className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-[#819087]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالوجهة أو اسم صاحب الطلب" className="h-10 w-full rounded-xl border border-[#DCE5DF] pr-9 pl-3 text-sm outline-none focus:border-[#168150]" /></label><select value={tripStatusFilter} onChange={(e) => setTripStatusFilter(e.target.value)} className="h-10 rounded-xl border border-[#DCE5DF] px-3 text-sm"><option value="all">كل الحالات</option><option value="pending">بانتظار شهم</option><option value="accepted">جارية</option><option value="completed">مكتملة</option><option value="cancelled">ملغاة</option><option value="expired">منتهية تلقائيًا</option></select></div>
        <div className="space-y-2">{filteredTrips.map((trip) => <article key={trip.id} className="rounded-2xl border border-[#E8EEEA] bg-[#FCFDFC] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-[#89938C]">{formatDate(trip.created_at)} · {shortId(trip.id)}</span><span className={'rounded-full px-2.5 py-1 text-[11px] font-bold ' + (trip.status === 'pending' ? 'bg-amber-50 text-amber-800' : trip.status === 'accepted' ? 'bg-sky-50 text-sky-800' : trip.status === 'completed' ? 'bg-[#E7F7ED] text-[#0B6742]' : trip.status === 'expired' ? 'bg-orange-50 text-orange-800' : 'bg-[#F1F2F3] text-[#65736A]')}>{trip.status === 'pending' ? 'بانتظار شهم' : trip.status === 'accepted' ? 'جارية' : trip.status === 'completed' ? 'مكتملة' : trip.status === 'expired' ? 'منتهية تلقائيًا' : 'ملغاة'}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center"><div><span className="block text-[10px] font-semibold text-[#89938C]">نقطة الانطلاق</span><strong className="mt-1 block text-sm text-[#26382E]">{trip.origin_area_label}</strong></div><span className="hidden text-[#20A66A] sm:block">←</span><div><span className="block text-[10px] font-semibold text-[#89938C]">الوجهة</span><strong className="mt-1 block text-sm text-[#26382E]">{trip.destination_area_label}</strong></div></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#EEF2EF] pt-3 text-[11px] text-[#65736A]"><span>طالب المساعدة: {tripNames[trip.requester_id] ?? shortId(trip.requester_id)}</span><span>الشهم: {trip.volunteer_id ? tripNames[trip.volunteer_id] ?? shortId(trip.volunteer_id) : 'لم يقبلها أحد بعد'}</span></div></article>)}{!filteredTrips.length && <p className="p-7 text-center text-xs text-[#748078]">لا توجد رحلات بهذا التصنيف.</p>}</div>
      </div>}

      {section === 'people' && canManagePeople && <div className="space-y-3 rounded-2xl border border-[#E1EAE4] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-[#173628]">إدارة الحسابات</h3><p className="mt-1 text-xs text-[#748078]">البحث، مراجعة الدور والحالة، وإيقاف أو إعادة تفعيل الحساب مع تسجيل السبب.</p></div><span className="rounded-full bg-[#E6F4ED] px-3 py-1 text-xs font-bold text-[#0B6742]">{profiles.length} حسابًا</span></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_190px]"><label className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-[#819087]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الهاتف أو رقم الحساب" className="h-10 w-full rounded-xl border border-[#DCE5DF] pr-9 pl-3 text-sm outline-none focus:border-[#168150]" /></label><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-10 rounded-xl border border-[#DCE5DF] px-3 text-sm"><option value="all">كل الأدوار</option><option value="volunteer">الشهمون</option><option value="requester">طالبو المساعدة</option></select></div>
        {loading ? <p className="p-5 text-center text-sm text-[#65736A]">جارٍ تحميل الحسابات…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-right text-xs"><thead className="bg-[#F5F8F6] text-[#65736A]"><tr><th className="p-3">المستخدم</th><th className="p-3">الهاتف</th><th className="p-3">الدور</th><th className="p-3">الحالة</th><th className="p-3">تاريخ الانضمام</th><th className="p-3">إجراء</th></tr></thead><tbody className="divide-y divide-[#EEF2EF]">{filteredProfiles.map((person) => <tr key={person.id}><td className="p-3 font-bold text-[#26382E]">{person.first_name}<span className="mt-1 block font-normal text-[#89938C]">{shortId(person.id)}</span></td><td className="p-3" dir="ltr">{person.phone_number}</td><td className="p-3">{roleLabels[person.role]}</td><td className="p-3"><span className={'rounded-full px-2 py-1 font-bold ' + (person.is_active ? 'bg-[#E7F7ED] text-[#0B6742]' : 'bg-red-50 text-red-700')}>{person.is_active ? 'نشط' : 'موقوف'}</span></td><td className="p-3 text-[#748078]">{formatDate(person.created_at)}</td><td className="p-3"><button type="button" disabled={busyId === person.id} onClick={() => void setProfileActive(person)} className={'min-h-9 rounded-lg px-3 font-bold disabled:opacity-50 ' + (person.is_active ? 'bg-red-50 text-red-700' : 'bg-[#E6F4ED] text-[#0B6742]')}>{busyId === person.id ? 'جارٍ الحفظ…' : person.is_active ? 'إيقاف' : 'إعادة تفعيل'}</button></td></tr>)}</tbody></table>{!filteredProfiles.length && <p className="p-7 text-center text-xs text-[#748078]">لا توجد حسابات مطابقة.</p>}</div>}
      </div>}

      {section === 'reports' && role !== 'analytics_viewer' && <SafetyPanel canSuspend={canManagePeople} />}
      {section === 'analytics' && <AnalyticsDashboard />}
      {section === 'activity' && <div className="rounded-2xl border border-[#E1EAE4] bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-bold text-[#173628]">سجل التدقيق</h3><p className="mt-1 text-xs text-[#748078]">الإجراءات الإدارية محفوظة لسهولة المراجعة والمساءلة.</p></div><button onClick={() => void loadAudit()} className="grid h-10 w-10 place-items-center rounded-xl bg-[#F4F8F5] text-[#0B6742]" aria-label="تحديث سجل التدقيق"><RefreshCw className="h-4 w-4" /></button></div>{loading ? <p className="p-8 text-center text-sm text-[#65736A]">جارٍ التحميل…</p> : auditRows.length ? <div className="mt-3 divide-y divide-[#EEF2EF]">{auditRows.map((row) => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><h4 className="text-sm font-bold text-[#26382E]">{row.action}</h4><p className="mt-1 text-xs text-[#65736A]">{row.reason || 'لا يوجد وصف إضافي'}{row.target_profile_id ? ` · الحساب ${shortId(row.target_profile_id)}` : ''}</p></div><div className="text-left text-[11px] text-[#748078]"><span className="block">المنفذ: {row.actor_id ? shortId(row.actor_id) : 'النظام'}</span><time>{formatDate(row.created_at)}</time></div></article>)}</div> : <p className="p-8 text-center text-sm text-[#748078]">لا توجد إجراءات مسجلة.</p>}</div>}

      {section === 'supervisors' && isSuperAdmin && <div className="space-y-4 rounded-2xl border border-[#E1EAE4] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-[#173628]">فريق الإشراف</h3><p className="mt-1 text-xs leading-5 text-[#748078]">الدعوة تنشئ حسابًا بصلاحية محددة. لا يمكن إضافة مدير عام من هذه الشاشة.</p></div><button type="button" onClick={() => setInviteOpen((value) => !value)} className="flex min-h-10 items-center gap-2 rounded-xl bg-[#0B6742] px-4 text-xs font-bold text-white"><MailPlus className="h-4 w-4" />دعوة مشرف</button></div>
        {inviteOpen && <form onSubmit={(event) => void inviteSupervisor(event)} className="grid gap-3 rounded-2xl border border-[#DCE8E0] bg-[#F8FBF9] p-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#53645a]">اسم المشرف<input required minLength={2} maxLength={40} value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#DCE5DF] bg-white px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-[#53645a]">البريد الإلكتروني<input required type="email" maxLength={254} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} dir="ltr" className="mt-1 h-11 w-full rounded-xl border border-[#DCE5DF] bg-white px-3 text-left text-sm" /></label>
          <label className="text-xs font-semibold text-[#53645a]">رقم الهاتف<input required minLength={7} maxLength={32} value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} dir="ltr" className="mt-1 h-11 w-full rounded-xl border border-[#DCE5DF] bg-white px-3 text-left text-sm" /></label>
          <label className="text-xs font-semibold text-[#53645a]">الصلاحية<select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)} className="mt-1 h-11 w-full rounded-xl border border-[#DCE5DF] bg-white px-3 text-sm"><option value="ops_admin">مشرف تشغيل</option><option value="verification_admin">مشرف توثيق</option><option value="analytics_viewer">مشرف تقارير للقراءة</option></select></label>
          <div className="flex gap-2 sm:col-span-2"><button disabled={busyId === 'invite'} className="min-h-11 rounded-xl bg-[#0B6742] px-5 text-sm font-bold text-white disabled:opacity-50">{busyId === 'invite' ? 'جارٍ إرسال الدعوة…' : 'إرسال دعوة آمنة'}</button><button type="button" onClick={() => setInviteOpen(false)} className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-[#65736A] ring-1 ring-[#DCE5DF]">إلغاء</button></div>
        </form>}
        {loading ? <p className="p-6 text-center text-sm text-[#65736A]">جارٍ تحميل المشرفين…</p> : <div className="space-y-2">{profiles.map((person) => <article key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8EEEA] p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#EAF7EF] text-[#0B6742]"><CircleUserRound className="h-5 w-5" /></span><div className="min-w-0"><strong className="block truncate text-sm text-[#26382E]">{person.first_name}</strong><span className="text-[11px] text-[#748078]">{roleLabels[person.role]} · {person.phone_number}</span><span className="mt-0.5 block text-[10px] text-[#89938C]">منذ {formatDate(person.created_at)}</span></div></div><div className="flex items-center gap-2"><span className={'rounded-full px-2 py-1 text-[10px] font-bold ' + (person.is_active ? 'bg-[#E7F7ED] text-[#0B6742]' : 'bg-red-50 text-red-700')}>{person.is_active ? 'نشط' : 'موقوف'}</span>{person.role !== 'super_admin' && <button disabled={busyId === person.id} onClick={() => void changeSupervisorStatus(person)} className="min-h-9 rounded-lg border border-[#DCE5DF] px-3 text-xs font-bold text-[#53645a] disabled:opacity-50">{busyId === person.id ? 'جارٍ الحفظ…' : person.is_active ? 'إيقاف الصلاحية' : 'إعادة التفعيل'}</button>}</div></article>)}{!profiles.length && <p className="p-8 text-center text-sm text-[#748078]">لا يوجد مشرفون مسجلون بعد.</p>}</div>}
        <p className="flex items-start gap-2 rounded-xl bg-[#FFF8E8] p-3 text-xs leading-5 text-[#76561A]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />الإجراءات تتطلب دور مدير عام وتُنفّذ من الخادم، وتُسجّل في سجل التدقيق. لا يملك المشرف المدعو صلاحية رفع دوره بنفسه.</p>
      </div>}
    </section>
  );
};
