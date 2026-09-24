import React from 'react';
import { toWhatsAppNumber } from '../../lib/phone';
import type { ContactCardData } from '../../lib/supabase';
import { Phone, MessageSquare, Map, ShieldCheck, AlertTriangle, HeartHandshake, Route, XCircle, Users } from 'lucide-react';

type VolunteerActiveTripCardProps = {
  data: ContactCardData;
  tripActionLoading: boolean;
  onCompleteTrip: (tripId: string) => void;
  onCancelTrip: (tripId: string) => void;
  onReport: () => void;
};

export const VolunteerActiveTripCard: React.FC<VolunteerActiveTripCardProps> = ({ data, tripActionLoading, onCompleteTrip, onCancelTrip, onReport }) => (
  <div className="stitch-card space-y-4 p-5">
    <div className="flex items-center justify-between gap-3">
      <span className="rounded-full bg-[#8df5b7]/60 px-3 py-1 text-xs font-semibold text-[#005131]">تم التنسيق بنجاح</span>
      <ShieldCheck className="h-5 w-5 shrink-0 text-[#146B44]" />
    </div>

    <div className="text-center">
      <h3 className="text-xl font-bold text-[#101f17]">{data.requester_first_name}</h3>
      <p className="text-sm text-[#53645a]">
        {data.requester_relation === 'patient' && 'مريض'}
        {data.requester_relation === 'guardian' && 'ولي أمر'}
        {data.requester_relation === 'companion' && 'مرافق'}
      </p>
    </div>

    <div className="stitch-soft-card space-y-4 p-4">
      <div className="flex items-center justify-center gap-2 text-sm font-bold text-[#005131]"><Route className="h-5 w-5" />تفاصيل المشوار</div>
      <div className="space-y-4 border-r-2 border-[#bfc9bf] pr-4 text-sm">
        <div className="relative">
          <span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#8df5b7] ring-4 ring-[#e6f8ec]" />
          <span className="block text-xs text-[#6f7a71]">نقطة البداية</span>
          <span className="block font-semibold text-[#101f17]">{data.origin_address}</span>
        </div>
        <div className="relative">
          <span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#146b44] ring-4 ring-[#e6f8ec]" />
          <span className="block text-xs text-[#6f7a71]">الوجهة</span>
          <span className="block font-semibold text-[#101f17]">{data.destination_address}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-[#cbdacf] pt-3 text-sm text-[#3f4942]">
        <span className="inline-flex items-center gap-1"><Users className="h-4 w-4 text-[#005131]" />عدد الأفراد: {data.passenger_count ?? 1}</span>
        {data.special_notes && <span><strong>ملاحظات:</strong> {data.special_notes}</span>}
      </div>
    </div>

    <div className="stitch-soft-card flex items-start gap-2 p-4 text-sm leading-7 text-[#3f4942]"><HeartHandshake className="mt-1 h-5 w-5 shrink-0 text-[#005131]" /><span><strong className="text-[#005131]">همسة شَهْم للطريق:</strong> كن عونًا وصبورًا، واجعل الابتسامة رفيقة الطريق.</span></div>

    <div className="grid grid-cols-3 gap-2">
      <a href={'tel:' + data.requester_phone} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-[#146B44] text-center text-xs font-semibold text-white active:bg-[#0F5636]">
        <Phone className="h-4 w-4" />اتصال
      </a>
      <a href={'https://wa.me/' + toWhatsAppNumber(data.requester_phone)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-[#1E8E5A] text-center text-xs font-semibold text-white active:bg-[#0F5636]">
        <MessageSquare className="h-4 w-4" />واتساب
      </a>
      <a href={'https://maps.google.com/?q=' + data.origin_lat + ',' + data.origin_lng} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-[#2F6FED] text-center text-xs font-semibold text-white">
        <Map className="h-4 w-4" />الخرائط
      </a>
    </div>

    <button onClick={() => onCompleteTrip(data.trip_id)} disabled={tripActionLoading} className="stitch-primary-button flex w-full items-center justify-center px-4 text-base active:bg-[#0F5636]">
      ✓ تم إيصاله بأمان
    </button>

    <div className="flex items-center justify-center gap-6">
      <button onClick={() => onCancelTrip(data.trip_id)} disabled={tripActionLoading} className="flex min-h-11 items-center justify-center gap-1 text-center text-xs text-[#6B7280] hover:text-[#B53A3A] disabled:opacity-50">
        <XCircle className="h-3.5 w-3.5" />إلغاء
      </button>
      <button onClick={() => onReport()} className="flex min-h-11 items-center justify-center gap-1 text-center text-xs text-[#6B7280] hover:text-[#B53A3A]">
        <AlertTriangle className="h-3.5 w-3.5" />إبلاغ عن مشكلة
      </button>
    </div>
  </div>
);
