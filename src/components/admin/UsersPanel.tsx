import React, { useState, useEffect } from 'react';
import { supabase, Profile } from '../../lib/supabase';
import { translateApiError } from '../../lib/apiErrors';
import { Users, RefreshCw, Loader2, Trash2, Eye, ShieldCheck, X, CheckCircle } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  volunteer: 'شهم',
  requester: 'مستفيد',
  ops_admin: 'أدمن تشغيلي',
  verification_admin: 'أدمن توثيق',
  analytics_viewer: 'مشاهد تحليلات',
  super_admin: 'أدمن رئيسي',
};

export const UsersPanel: React.FC = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<{ id: string; data: unknown } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setUsers(data as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleViewDetails = async (userId: string) => {
    setDetailsLoading(true);
    setDetails({ id: userId, data: null });
    const { data, error } = await supabase.rpc('get_user_full_details', { p_target_profile_id: userId });
    setDetailsLoading(false);
    if (error) {
      alert(translateApiError(error.message));
      setDetails(null);
      return;
    }
    setDetails({ id: userId, data });
  };

  const handleDelete = async (userId: string, role: string) => {
    if (role === 'super_admin') return;
    const reason = prompt('يرجى توثيق سبب حذف هذا الحساب نهائياً (5 أحرف على الأقل):');
    if (!reason || reason.trim().length < 5) return;
    if (!confirm('هذا الإجراء نهائي ولا يمكن التراجع عنه. تأكيد الحذف؟')) return;

    setActionLoading(userId);
    const { error } = await supabase.rpc('delete_user', {
      p_target_profile_id: userId,
      p_reason: reason.trim(),
    });
    setActionLoading(null);

    if (!error) {
      setActionMsg('تم حذف الحساب نهائياً.');
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } else {
      alert(translateApiError(error.message));
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 text-right">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-[#146B44]" />
          <h2 className="text-xl font-bold text-[#1F2430]">إدارة المستخدمين</h2>
        </div>
        <button onClick={fetchUsers} className="text-xs text-[#146B44] flex items-center gap-1 font-semibold">
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
          <p className="text-xs">جاري تحميل المستخدمين...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-[#8A949E]/20 text-xs text-[#6B7280]">
          لا يوجد مستخدمون
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="p-3 bg-white rounded-xl border border-[#8A949E]/20 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-bold text-[#1F2430]">
                  {u.first_name}
                  {u.role === 'super_admin' && <ShieldCheck className="w-3.5 h-3.5 text-[#146B44]" />}
                </div>
                <div className="text-xs text-[#6B7280] flex items-center gap-2 flex-wrap">
                  <span className="bg-[#F7F8F9] px-1.5 py-0.5 rounded-md">{ROLE_LABELS[u.role] || u.role}</span>
                  <span>{u.phone_number}</span>
                  {!u.is_active && <span className="text-[#B53A3A]">معلّق</span>}
                </div>
              </div>

              <button
                onClick={() => handleViewDetails(u.id)}
                className="shrink-0 p-2 rounded-lg bg-[#F7F8F9] text-[#146B44] hover:bg-[#E6F4ED]"
                aria-label="عرض البيانات الكاملة"
              >
                <Eye className="w-4 h-4" />
              </button>

              {u.role !== 'super_admin' && (
                <button
                  disabled={actionLoading === u.id}
                  onClick={() => handleDelete(u.id, u.role)}
                  className="shrink-0 p-2 rounded-lg bg-[#FCEAEA] text-[#B53A3A] hover:bg-[#B53A3A] hover:text-white transition-colors"
                  aria-label="حذف الحساب نهائياً"
                >
                  {actionLoading === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {details && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-[#1F2430]">بيانات المستخدم الكاملة</h3>
              <button onClick={() => setDetails(null)} className="text-[#6B7280]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailsLoading ? (
              <div className="p-8 text-center text-[#6B7280]">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#146B44]" />
                <p className="text-xs">جاري التحميل...</p>
              </div>
            ) : (
              <pre className="text-[10px] leading-5 bg-[#F7F8F9] p-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-words text-[#1F2430]" dir="ltr">
                {JSON.stringify(details.data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
