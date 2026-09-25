import React, { useState, useEffect } from 'react';
import { supabase, Report } from '../../lib/supabase';
import { ShieldAlert, CheckCircle, Ban, RefreshCw, Loader2, Eye, CircleSlash, CheckCheck } from 'lucide-react';

export const SafetyPanel: React.FC<{ canSuspend?: boolean }> = ({ canSuspend = true }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [reporterFilter, setReporterFilter] = useState('all');

  const categoryLabels: Record<string, string> = {
    plate_incorrect: 'رقم اللوحة غير صحيح',
    vehicle_color_incorrect: 'لون السيارة غير صحيح',
    harassment: 'تحرش أو مضايقة',
    abusive_behavior: 'أسلوب مسيء',
    scam: 'نصب أو احتيال',
    not_eligible: 'غير مستحق للمساعدة',
    other: 'سبب آخر',
  };

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('reports').select('*').order('created_at', { ascending: false });
    if (error) setActionMsg('تعذر تحميل البلاغات. تأكد من صلاحية حساب الإدارة.');
    if (data) setReports(data as Report[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const filteredReports = reports.filter((report) =>
    (categoryFilter === 'all' || report.category === categoryFilter) &&
    (reporterFilter === 'all' || report.reporter_role === reporterFilter),
  );

  const handleSuspend = async (profileId: string) => {
    const reason = prompt('يرجى توثيق سبب تعليق الحساب في سجل التدقيق:');
    if (!reason) return;

    setActionLoading(true);
    const { error } = await supabase.rpc('suspend_account', {
      p_target_profile_id: profileId,
      p_reason: reason.trim(),
    });
    setActionLoading(false);

    if (!error) {
      setActionMsg('تم تعليق الحساب وتوثيق الإجراء بنجاح.');
      fetchReports();
    } else {
      alert(error.message);
    }
  };

  const handleResolve = async (reportId: string, status: 'reviewed' | 'dismissed' | 'actioned') => {
    setActionLoading(true);
    const { error } = await supabase.rpc('resolve_report', { p_report_id: reportId, p_status: status });
    setActionLoading(false);
    if (error) {
      setActionMsg('تعذر تحديث حالة البلاغ. تحقق من الترحيلات وصلاحية حسابك.');
      return;
    }
    setActionMsg(status === 'actioned' ? 'تم اتخاذ إجراء وتوثيق البلاغ.' : status === 'dismissed' ? 'تم إغلاق البلاغ دون إجراء.' : 'تم تسجيل مراجعة البلاغ.');
    await fetchReports();
  };

  const statusLabels: Record<string, string> = {
    pending: 'قيد المراجعة', reviewed: 'تمت المراجعة', dismissed: 'مغلق دون إجراء', actioned: 'تم اتخاذ إجراء',
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 text-right">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-[#146B44]" />
          <h2 className="text-xl font-bold text-[#1F2430]">لوحة الأمان ومتابعة البلاغات</h2>
        </div>
        <button onClick={fetchReports} className="text-xs text-[#146B44] flex items-center gap-1 font-semibold">
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </button>
      </div>

      {actionMsg && (
        <div className="p-3 bg-[#E6F4ED] text-[#146B44] rounded-xl text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>{actionMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-[#6B7280]">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#146B44]" />
          <p className="text-xs">جاري تحميل البلاغات المسجلة...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-[#8A949E]/20 text-xs text-[#6B7280]">
          لا توجد بلاغات مسجلة حالياً
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#146B44]/10 bg-white p-3">
            <label className="text-[11px] font-semibold text-[#53645a]">نوع البلاغ
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#8A949E]/40 bg-white px-2 text-xs">
                <option value="all">كل التصنيفات</option>
                {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-[#53645a]">مقدم البلاغ
              <select value={reporterFilter} onChange={(event) => setReporterFilter(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#8A949E]/40 bg-white px-2 text-xs">
                <option value="all">كل المستخدمين</option><option value="volunteer">Shahm</option><option value="requester">Patient</option>
              </select>
            </label>
          </div>
          {filteredReports.length === 0 && <p className="rounded-xl bg-white p-5 text-center text-xs text-[#6B7280]">لا توجد بلاغات بهذا التصنيف.</p>}
          {filteredReports.map((rep) => (
            <div key={rep.id} className="p-4 bg-white rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className={`px-2 py-0.5 rounded-md font-semibold ${
                  rep.status === 'pending' ? 'bg-[#FBEFDC] text-[#8F5A0A]' : 'bg-[#EEF0EF] text-[#4B5A52]'
                }`}>
                  {statusLabels[rep.status] || rep.status}
                </span>
                <span className="text-[#6B7280]">{new Date(rep.created_at).toLocaleString('ar-EG')}</span>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-full bg-[#E6F4ED] px-2.5 py-1 text-[#146B44]">{categoryLabels[rep.category] || 'سبب آخر'}</span>
                <span className="rounded-full bg-[#F1F2F3] px-2.5 py-1 text-[#53645a]">مقدم البلاغ: {rep.reporter_role === 'volunteer' ? 'Shahm' : 'Patient'}</span>
              </div>

              <p className="text-sm font-medium text-[#1F2430] bg-[#F7F8F9] p-3 rounded-xl">{rep.reason}</p>

              {canSuspend && rep.reported_profile_id && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleSuspend(rep.reported_profile_id!)}
                  className="text-xs px-3 py-1.5 bg-[#FCEAEA] text-[#B53A3A] rounded-lg font-semibold hover:bg-[#B53A3A] hover:text-white transition-colors flex items-center gap-1"
                >
                  <Ban className="w-3.5 h-3.5" />
                  تعليق حساب المستخدم المُبلَّغ عنه
                </button>
              )}

              {rep.status === 'pending' && <div className="flex flex-wrap gap-2 border-t border-[#EEF0EF] pt-3">
                <button type="button" disabled={actionLoading} onClick={() => void handleResolve(rep.id, 'reviewed')} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-sky-50 px-3 text-xs font-semibold text-sky-800 disabled:opacity-50"><Eye className="h-3.5 w-3.5" />تمت المراجعة</button>
                <button type="button" disabled={actionLoading} onClick={() => void handleResolve(rep.id, 'actioned')} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#E6F4ED] px-3 text-xs font-semibold text-[#146B44] disabled:opacity-50"><CheckCheck className="h-3.5 w-3.5" />اتخاذ إجراء</button>
                <button type="button" disabled={actionLoading} onClick={() => void handleResolve(rep.id, 'dismissed')} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#F1F2F3] px-3 text-xs font-semibold text-[#53645a] disabled:opacity-50"><CircleSlash className="h-3.5 w-3.5" />إغلاق البلاغ</button>
              </div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
