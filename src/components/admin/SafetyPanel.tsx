import React, { useState, useEffect } from 'react';
import { supabase, Report } from '../../lib/supabase';
import { ShieldAlert, CheckCircle, Ban, RefreshCw, Loader2 } from 'lucide-react';

export const SafetyPanel: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    const { data } = await supabase.from('reports').select('*').order('created_at', { ascending: false });
    if (data) setReports(data as Report[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

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
          {reports.map((rep) => (
            <div key={rep.id} className="p-4 bg-white rounded-2xl border border-[#8A949E]/20 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className={`px-2 py-0.5 rounded-md font-semibold ${
                  rep.status === 'pending' ? 'bg-[#FBEFDC] text-[#8F5A0A]' : 'bg-[#EEF0EF] text-[#4B5A52]'
                }`}>
                  {rep.status === 'pending' ? 'قيد المراجعة' : 'تم التعامل'}
                </span>
                <span className="text-[#6B7280]">{new Date(rep.created_at).toLocaleString('ar-EG')}</span>
              </div>

              <p className="text-sm font-medium text-[#1F2430] bg-[#F7F8F9] p-3 rounded-xl">{rep.reason}</p>

              {rep.reported_profile_id && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleSuspend(rep.reported_profile_id!)}
                  className="text-xs px-3 py-1.5 bg-[#FCEAEA] text-[#B53A3A] rounded-lg font-semibold hover:bg-[#B53A3A] hover:text-white transition-colors flex items-center gap-1"
                >
                  <Ban className="w-3.5 h-3.5" />
                  تعليق حساب المستخدم المُبلَّغ عنه
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
