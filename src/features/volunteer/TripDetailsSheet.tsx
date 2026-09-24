import React from 'react';
import type { NearbyTrip } from '../../lib/supabase';
import { QuoteCard } from '../../components/common/QuoteCard';
import { Loader2, Clock, ShieldCheck, Navigation, HeartHandshake, LockKeyhole, Route, Handshake } from 'lucide-react';

type TripDetailsSheetProps = {
  trip: NearbyTrip;
  acceptingTripId: string | null;
  onAccept: (tripId: string) => void;
  onClose: () => void;
};

export const TripDetailsSheet: React.FC<TripDetailsSheetProps> = ({ trip, acceptingTripId, onAccept, onClose }) => (
  <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[#25342c]/45 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-[#ecfef1] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#bfc9bf]" />
      <div className="stitch-soft-card relative overflow-hidden p-4">
        <div className="relative z-10 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#146b44] text-white"><HeartHandshake className="h-6 w-6" /></div>
          <div><h3 className="text-lg font-bold text-[#005131]">طلب رحلة بانتظارك</h3><p className="mt-1 text-sm leading-7 text-[#3f4942]">وقوفك جنب شخص محتاج بيصنع فارقًا في الطريق.</p></div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="stitch-card p-3 text-center"><Navigation className="mx-auto h-5 w-5 text-[#005131]" /><span className="mt-1 block text-[11px] text-[#3f4942]">المسافة إليك</span><strong className="block text-sm text-[#101f17]">{trip.distance_km ?? '--'} كم</strong><span className="text-[11px] text-[#006d41]">نطاق معتمد</span></div>
        <div className="stitch-card p-3 text-center"><Clock className="mx-auto h-5 w-5 text-[#006d41]" /><span className="mt-1 block text-[11px] text-[#3f4942]">وقت الوصول</span><strong className="block text-sm text-[#101f17]">قريبًا</strong><span className="text-[11px] text-[#3f4942]">بالمركبة</span></div>
      </div>

      <div className="mt-3"><QuoteCard /></div>

      <div className="stitch-card mt-3 space-y-4 p-4">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Route className="h-5 w-5 text-[#005131]" /><h3 className="font-bold text-[#101f17]">مسار المشوار التقديري</h3></div><span className="rounded-full bg-[#dbece0] px-2 py-1 text-[11px] text-[#3f4942]">خصوصية محفوظة</span></div>
        <div className="space-y-3 border-r-2 border-[#dbece0] pr-4">
          <div className="relative"><span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#8df5b7] ring-4 ring-[#ecfef1]" /><span className="block text-xs font-semibold text-[#006d41]">نقطة الانطلاق التقديرية</span><span className="block text-sm font-semibold text-[#101f17]">{trip.origin_area_label}</span><span className="block text-xs leading-6 text-[#6f7a71]">يُكشف العنوان التفصيلي بعد القبول فقط.</span></div>
          <div className="relative"><span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#146b44] ring-4 ring-[#ecfef1]" /><span className="block text-xs font-semibold text-[#005131]">الوجهة الطبية المعتمدة</span><span className="block text-sm font-semibold text-[#101f17]">{trip.destination_area_label}</span></div>
        </div>
      </div>

      <div className="stitch-card mt-3 space-y-3 p-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#005131]" /><h3 className="font-bold text-[#101f17]">بيانات المشوار المعتمدة</h3></div>
        <div className="flex items-start gap-2 rounded-xl bg-[#e1f2e6] p-3 text-xs leading-6 text-[#3f4942]"><LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-[#005131]" />بيانات الحالة والعنوان ورقم التواصل تظل مخفية حتى قبول المشوار حفاظًا على خصوصية المستفيد.</div>
        <div className="text-sm text-[#3f4942]"><strong>عدد الأفراد:</strong> {trip.passenger_count ?? 1}</div>
        {trip.special_notes && <div className="rounded-xl bg-[#F7F8F9] p-3 text-sm leading-6 text-[#3f4942]"><strong>ملاحظات:</strong> {trip.special_notes}</div>}
      </div>

      <div className="mt-3 flex flex-col gap-2"><button disabled={acceptingTripId === trip.id} onClick={() => onAccept(trip.id)} className="stitch-primary-button flex w-full items-center justify-center gap-2 px-4 text-base">{acceptingTripId === trip.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Handshake className="h-5 w-5" />قبول الرحلة</>}</button><button type="button" onClick={() => onClose()} className="py-2 text-sm font-semibold text-[#3f4942] underline underline-offset-4">الرجوع إلى قائمة الرحلات المتاحة</button></div>
    </div>
  </div>
);
