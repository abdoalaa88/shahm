import React from 'react';
import { toWhatsAppNumber } from '../../lib/phone';
import type { ContactCardData } from '../../lib/supabase';
import { Phone, MessageSquare, Map, ShieldCheck, AlertTriangle, HeartHandshake, Route, XCircle } from 'lucide-react';

type VolunteerActiveTripCardProps = {
  data: ContactCardData;
  tripActionLoading: boolean;
  onCompleteTrip: (tripId: string) => void;
  onCancelTrip: (tripId: string) => void;
  onReport: () => void;
};

export const VolunteerActiveTripCard: React.FC<VolunteerActiveTripCardProps> = ({ data, tripActionLoading, onCompleteTrip, onCancelTrip, onReport }) => (
  <div className="stitch-card p-6 space-y-4">
    <div className="flex items-center justify-between">
      <span className="rounded-full bg-[#8df5b7]/60 px-3 py-1 text-xs font-semibold text-[#005131]">
        تم التنسيق بنجاح
      </span>
      <ShieldCheck className="w-5 h-5 text-[#146B44]" />
    </div>

    <div>
      <h3 className="text-xl font-bold text-[#101f17]">{data.requester_first_name}</h3>
      <p className="text-sm text-[#3f4942]">
        {data.requester_relation === 'patient' && 'مريض'}
        {data.requester_relation === 'guardian' && 'ولي أمر'}
        {data.requester_relation === 'companion' && 'مرافق'}
      </p>
    </div>

    <div className="stitch-soft-card space-y-3 p-4 text-right">
      <div className="flex items-center gap-2 text-sm font-bold text-[#005131]"><Route className="h-5 w-5" />مسار المشوار ونقطة اللقاء</div>
      <div className="space-y-3 border-r-2 border-[#bfc9bf] pr-4 text-sm">
        <div className="relative"><span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#8df5b7] ring-4 ring-[#e6f8ec]" /><span className="block text-xs text-[#6f7a71]">نقطة الانطلاق</span><span className="block font-semibold text-[#101f17]">{data.origin_address}</span></div>
        <div className="relative"><span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#146b44] ring-4 ring-[#e6f8ec]" /><span className="block text-xs text-[#6f7a71]">الوجهة الطبية</span><span className="block font-semibold text-[#101f17]">{data.destination_address}</span></div>
      </div>
      <div className="space-y-2 border-t border-dashed border-[#bfc9bf] pt-3 text-sm">
        <div><strong>عدد الأفراد:</strong> {data.passenger_count ?? 1}</div>
        {data.special_notes && <div><strong>ملاحظات:</strong> {data.special_notes}</div>}
      </div>
    </div>

    <div className="stitch-soft-card flex items-start gap-2 p-4 text-sm leading-7 text-[#3f4942]"><HeartHandshake className="mt-1 h-5 w-5 shrink-0 text-[#005131]" /><span><strong className="text-[#005131]">همسة شَهْم للطريق:</strong> كن عونًا وصبورًا، واجعل الابتسامة رفيقة الطريق.</span></div>

    <div className="grid grid-cols-3 gap-2">
      <a
        href={`tel:${data.requester_phone}`}
        className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#146B44] text-xs font-semibold text-white active:bg-[#0F5636]"
      >
        <Phone className="w-4 h-4" />
        اتصال
      </a>
      <a
        href={`https://wa.me/${toWhatsAppNumber(data.requester_phone)}`}
        target="_blank"
        rel="noreferrer"
        className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#1E8E5A] text-xs font-semibold text-white active:bg-[#0F5636]"
      >
        <MessageSquare className="w-4 h-4" />
        واتساب
      </a>
      <a
        href={`https://maps.google.com/?q=${data.origin_lat},${data.origin_lng}`}
        target="_blank"
        rel="noreferrer"
        className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#2F6FED] text-xs font-semibold text-white"
      >
        <Map className="w-4 h-4" />
        الخرائط
      </a>
    </div>

    <button
      onClick={() => onCompleteTrip(data.trip_id)}
      disabled={tripActionLoading}
      className="stitch-primary-button w-full text-base active:bg-[#0F5636] transition-colors"
    >
      ✓ تم إيصاله بأمان
    </button>

    <div className="flex items-center justify-center gap-6">
      <button
        onClick={() => onCancelTrip(data.trip_id)}
        disabled={tripActionLoading}
        className="text-xs text-[#6B7280] hover:text-[#B53A3A] flex items-center justify-center gap-1 disabled:opacity-50"
      >
        <XCircle className="w-3.5 h-3.5" />
        إلغاء
      </button>
      <button
        onClick={() => onReport()}
        className="text-xs text-[#6B7280] hover:text-[#B53A3A] flex items-center justify-center gap-1"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        إبلاغ عن مشكلة
      </button>
    </div>
  </div>
);
