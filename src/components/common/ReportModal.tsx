import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

interface ReportModalProps {
  tripId?: string;
  reportedProfileId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  tripId,
  reportedProfileId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setErrorMsg('يرجى توضيح سبب المشكلة بما لا يقل عن 5 أحرف');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const { error } = await supabase.rpc('submit_report', {
      p_trip_id: tripId || null,
      p_reported_profile_id: reportedProfileId || null,
      p_reason: reason.trim(),
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setReason('');
      onSuccess();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-lg text-right">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#FCEAEA] text-[#B53A3A] rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-[#1F2430]">إبلاغ عن مشكلة</h3>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#1F2430]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[#6B7280] leading-relaxed">
          نحن هنا لضمان سلامة الجميع وحفظ كرامتهم. سيراجع المشرفون ملاحظتك بسرية تامة.
        </p>

        {errorMsg && <div className="p-2.5 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <textarea
              rows={4}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اكتب ما حدث معك بوضوح..."
              className="w-full p-3 bg-white border border-[#8A949E] rounded-xl text-sm text-[#1F2430] focus:border-[#2F6FED] focus:outline-none resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 border border-[#8A949E] text-[#1F2430] text-sm font-semibold rounded-xl hover:bg-[#F7F8F9]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-11 bg-[#B53A3A] text-white text-sm font-semibold rounded-xl hover:bg-[#991B1B] flex items-center justify-center gap-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إرسال الإبلاغ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
