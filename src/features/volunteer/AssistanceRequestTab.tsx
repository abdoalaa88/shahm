import React from 'react';
import { toWhatsAppNumber } from '../../lib/phone';
import type { MyAssistanceRequest } from '../../lib/supabase';
import type { AssistanceRole } from '../../lib/appTypes';
import { Clock, Phone, MessageSquare, Loader2 } from 'lucide-react';

type AssistanceRequestTabProps = {
  myAssistanceRequest: MyAssistanceRequest | null;
  assistanceActionLoading: boolean;
  assistanceSuccess: boolean;
  assistanceType: string;
  assistanceDescription: string;
  assistanceLoading: boolean;
  assistanceExpired: boolean;
  onCompleteAssistance: (assistanceId: string, role: AssistanceRole) => void;
  onCancelAssistance: (assistanceId: string) => void;
  onAssistanceTypeChange: (issueType: string) => void;
  onAssistanceDescriptionChange: (description: string) => void;
  onCreateAssistanceRequest: () => void;
};

export const AssistanceRequestTab: React.FC<AssistanceRequestTabProps> = ({
  myAssistanceRequest,
  assistanceActionLoading,
  assistanceSuccess,
  assistanceType,
  assistanceDescription,
  assistanceLoading,
  assistanceExpired,
  onCompleteAssistance,
  onCancelAssistance,
  onAssistanceTypeChange,
  onAssistanceDescriptionChange,
  onCreateAssistanceRequest,
}) => {
  if (myAssistanceRequest?.status === 'pending') {
    return (
      <section className="flex min-h-[52dvh] flex-col items-center justify-center gap-6 text-center" aria-label="انتظار قبول طلب العون">
        <div className="relative flex h-40 w-40 items-center justify-center" role="status" aria-live="polite">
          <div className="absolute inset-2 rounded-full border-[9px] border-[#dbece0]" />
          <div className="absolute inset-2 rounded-full border-[9px] border-[#1e8e5a] border-t-transparent motion-safe:animate-spin" />
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#005131] text-white shadow-lg">
            <Clock className="h-9 w-9" />
          </div>
          <span className="sr-only">طلب العون قيد الانتظار.</span>
        </div>
        <button
          type="button"
          onClick={() => onCancelAssistance(myAssistanceRequest.assistance_id)}
          disabled={assistanceActionLoading}
          className="min-h-11 rounded-full bg-[#dbece0] px-6 text-center text-sm font-semibold text-[#005131] transition-colors hover:bg-[#cdded2] disabled:opacity-50"
        >
          إلغاء الطلب
        </button>
      </section>
    );
  }

  return (
    <section className="stitch-card space-y-4 p-5 text-center">
      {myAssistanceRequest?.status === 'accepted' ? (
        <>
          <div className="rounded-xl bg-[#E6F4ED] p-3 text-center text-sm font-semibold text-[#146B44]">شهم قبل طلب العون، وهيتواصل معاك دلوقتي.</div>
          <div className="stitch-soft-card space-y-2 p-4 text-center text-sm">
            <div><strong>الاسم:</strong> {myAssistanceRequest.helper_first_name}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a href={'tel:' + myAssistanceRequest.helper_phone} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-[#146B44] text-center text-xs font-semibold text-white active:bg-[#0F5636]">
              <Phone className="h-4 w-4" />اتصال
            </a>
            <a href={'https://wa.me/' + toWhatsAppNumber(myAssistanceRequest.helper_phone || '')} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-[#1E8E5A] text-center text-xs font-semibold text-white active:bg-[#0F5636]">
              <MessageSquare className="h-4 w-4" />واتساب
            </a>
          </div>
          <button type="button" disabled={assistanceActionLoading} onClick={() => onCompleteAssistance(myAssistanceRequest.assistance_id, 'requester')} className="stitch-primary-button w-full px-4 text-center text-sm">
            تمت المساعدة ✓
          </button>
        </>
      ) : (
        <>
          <div className="stitch-soft-card space-y-2 p-4">
            <h2 className="text-base font-bold text-[#005131]">طلب عون</h2>
            <p className="text-sm leading-7 text-[#53645a]">لو عربيتك عطلت أو واجهت مشكلة على الطريق، اطلب مساعدة من شهم قريب منك.</p>
          </div>
          {assistanceExpired && <div className="rounded-xl bg-[#FBEFDC] p-3 text-sm leading-7 text-[#8F5A0A]">انتهت مدة الطلب من غير قبول. ابعت طلبًا جديدًا لو ما زلت محتاجًا للمساعدة.</div>}
          {assistanceSuccess && !assistanceExpired && <div className="rounded-xl bg-[#E6F4ED] p-3 text-sm text-[#146B44]">تم إرسال طلب العون.</div>}
          <label className="block text-right text-sm font-semibold text-[#24372c]">
            نوع المشكلة
            <select value={assistanceType} onChange={(event) => onAssistanceTypeChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm font-normal">
              <option value="tire">كاوتش</option><option value="fuel">بنزين</option><option value="battery">بطارية</option><option value="water">مياه</option><option value="breakdown">عطل في العربية</option><option value="other">أخرى</option>
            </select>
          </label>
          <label className="block text-right text-sm font-semibold text-[#24372c]">
            وصف المشكلة
            <textarea value={assistanceDescription} onChange={(event) => onAssistanceDescriptionChange(event.target.value)} maxLength={1000} placeholder="اكتب المشكلة بالتفصيل..." className="mt-2 min-h-28 w-full rounded-xl border border-[#8A949E] bg-white p-3 text-sm font-normal" />
          </label>
          <button type="button" onClick={onCreateAssistanceRequest} disabled={assistanceLoading} className="stitch-primary-button flex w-full items-center justify-center px-4 text-center text-sm">
            {assistanceLoading ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" /> : 'إرسال طلب عون'}
          </button>
        </>
      )}
    </section>
  );
};
