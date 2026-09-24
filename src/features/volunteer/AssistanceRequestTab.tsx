import React from 'react';
import { toWhatsAppNumber } from '../../lib/phone';
import type { MyAssistanceRequest } from '../../lib/supabase';
import type { AssistanceRole } from '../../lib/appTypes';
import { PendingLoader } from '../../components/common/PendingLoader';
import { Phone, MessageSquare, Loader2, Handshake } from 'lucide-react';

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
}) => myAssistanceRequest?.status === 'pending' ? (
  <section className="stitch-card flex min-h-[24rem] flex-col items-center justify-center gap-6 p-5">
    <PendingLoader />
    <button
      type="button"
      onClick={() => onCancelAssistance(myAssistanceRequest.assistance_id)}
      disabled={assistanceActionLoading}
      className="w-full rounded-full bg-[#dbece0] py-3 text-center text-sm font-semibold text-[#005131] transition-colors hover:bg-[#cdded2]"
    >
      إلغاء الطلب
    </button>
  </section>
) : (
  <section className="stitch-card space-y-4 p-5">
    <div className="stitch-soft-card flex items-start gap-3 p-4"><Handshake className="mt-1 h-5 w-5 shrink-0 text-[#005131]" /><div><h2 className="font-bold text-[#005131]">طلب عون</h2><p className="mt-1 text-sm leading-7 text-[#3f4942]">لو عربيتك عطلت أو عندك مشكلة على الطريق، اطلب عونًا من الشهم القريب منك.</p></div></div>

    {myAssistanceRequest?.status === 'accepted' ? (
      <div className="space-y-3">
        <div className="rounded-xl bg-[#E6F4ED] p-3 text-center text-sm font-semibold text-[#146B44]">
          شهم قبل طلب العون بتاعك، وهيتواصل معاك دلوقتي
        </div>
        <div className="stitch-soft-card space-y-2 p-4 text-right text-sm">
          <div><strong>الاسم:</strong> {myAssistanceRequest.helper_first_name}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`tel:${myAssistanceRequest.helper_phone}`}
            className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#146B44] text-xs font-semibold text-white active:bg-[#0F5636]"
          >
            <Phone className="w-4 h-4" />
            اتصال
          </a>
          <a
            href={`https://wa.me/${toWhatsAppNumber(myAssistanceRequest.helper_phone || '')}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#1E8E5A] text-xs font-semibold text-white active:bg-[#0F5636]"
          >
            <MessageSquare className="w-4 h-4" />
            واتساب
          </a>
        </div>
        <button
          type="button"
          disabled={assistanceActionLoading}
          onClick={() => onCompleteAssistance(myAssistanceRequest.assistance_id, 'requester')}
          className="stitch-primary-button w-full px-4 text-sm"
        >
          تمت المساعدة ✓
        </button>
      </div>
    ) : (
      <>
        {assistanceExpired && <div className="rounded-xl bg-[#FBEFDC] p-3 text-sm leading-7 text-[#8F5A0A]">انتهت مدة طلب العون من غير ما حد يقبله، ابعت طلب جديد لو لسه محتاج مساعدة.</div>}
        {assistanceSuccess && !assistanceExpired && <div className="rounded-xl bg-[#E6F4ED] p-3 text-sm text-[#146B44]">تم إرسال طلب العون.</div>}
        <select value={assistanceType} onChange={(event) => onAssistanceTypeChange(event.target.value)} className="h-11 w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm">
          <option value="tire">كاوتش</option><option value="fuel">بنزين</option><option value="battery">بطارية</option><option value="water">مياه</option><option value="breakdown">عطل في العربية</option><option value="other">أخرى</option>
        </select>
        <textarea value={assistanceDescription} onChange={(event) => onAssistanceDescriptionChange(event.target.value)} maxLength={1000} placeholder="اكتب المشكلة بالتفصيل..." className="min-h-28 w-full rounded-xl border border-[#8A949E] bg-white p-3 text-sm" />
        <button type="button" onClick={onCreateAssistanceRequest} disabled={assistanceLoading} className="stitch-primary-button w-full px-4 text-sm">{assistanceLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'إرسال طلب عون'}</button>
      </>
    )}
  </section>
);
