import React from 'react';
import type { PublicTrip } from '../../lib/supabase';
import { CheckCircle2, Clock, AlertTriangle, Users } from 'lucide-react';

type RequesterTripCardProps = {
  trip: PublicTrip;
  tripActionLoading: boolean;
  onCancelTrip: (tripId: string) => void;
  onStartNewRequest: () => void;
  onCompleteTrip: (tripId: string) => void;
  onReport: () => void;
};

const TripSummary: React.FC<{ trip: PublicTrip }> = ({ trip }) => (
  <div className="stitch-soft-card space-y-3 p-4 text-right text-sm">
    <div className="space-y-3 border-r-2 border-[#cbdacf] pr-4">
      <div className="relative">
        <span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#8df5b7] ring-4 ring-[#e6f8ec]" />
        <span className="block text-xs text-[#53645a]">نقطة البداية</span>
        <strong className="block text-[#101f17]">{trip.origin_area_label}</strong>
      </div>
      <div className="relative">
        <span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-[#146b44] ring-4 ring-[#e6f8ec]" />
        <span className="block text-xs text-[#53645a]">الوجهة</span>
        <strong className="block text-[#101f17]">{trip.destination_area_label}</strong>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-[#cbdacf] pt-3 text-center text-[#3f4942]">
      <span className="inline-flex items-center gap-1"><Users className="h-4 w-4 text-[#005131]" />عدد الأفراد: {trip.passenger_count ?? 1}</span>
      {trip.special_notes && <span><strong>ملاحظات:</strong> {trip.special_notes}</span>}
    </div>
  </div>
);

export const RequesterTripCard: React.FC<RequesterTripCardProps> = ({
  trip,
  tripActionLoading,
  onCancelTrip,
  onStartNewRequest,
  onCompleteTrip,
  onReport,
}) => (
  <div className="stitch-card space-y-4 p-5 text-center">
    {trip.status === 'pending' ? (
      <>
        <div className="relative mx-auto flex h-36 w-36 items-center justify-center" role="status" aria-live="polite">
          <div className="absolute inset-3 rounded-full border-8 border-[#dbece0]" />
          <div className="absolute inset-3 rounded-full border-8 border-[#8df5b7] border-t-transparent animate-spin" />
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#005131] text-white shadow-lg">
            <Clock className="h-9 w-9" />
          </div>
          <span className="sr-only">طلبك قيد الانتظار ويبحث عن شهم قريب.</span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#e6f4ed] px-3 py-1 text-xs font-bold text-[#005131]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#006d41]" />
          جارٍ البحث عن شهم قريب
        </span>
        <h3 className="text-xl font-bold text-[#101f17]">طلبك قيد الانتظار</h3>
        <p className="mx-auto max-w-sm text-sm leading-7 text-[#53645a]">تظهر تفاصيل التواصل بعد قبول المشوار حفاظًا على خصوصيتك.</p>
        <TripSummary trip={trip} />
        <button onClick={() => onCancelTrip(trip.id)} disabled={tripActionLoading} className="min-h-11 w-full rounded-full bg-[#dbece0] px-4 text-center text-sm font-semibold text-[#005131] transition-colors hover:bg-[#cdded2]">
          إلغاء الطلب
        </button>
      </>
    ) : trip.status === 'expired' ? (
      <>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F7ECD9] text-[#8F5A0A]">
          <Clock className="h-8 w-8" />
        </div>
        <span className="inline-flex rounded-full bg-[#FBEFDC] px-3 py-1 text-xs font-bold text-[#8F5A0A]">انتهت صلاحية الطلب</span>
        <h3 className="text-xl font-bold text-[#101f17]">لم يقبل أحد طلبك خلال ١٥ دقيقة</h3>
        <p className="text-sm leading-7 text-[#53645a]">تقدر تبدأ طلبًا جديدًا لو ما زلت تحتاج للمساعدة.</p>
        <TripSummary trip={trip} />
        <button onClick={onStartNewRequest} className="stitch-primary-button w-full px-4 text-base">ابدأ طلبًا جديدًا</button>
      </>
    ) : (
      <>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#8df5b7] text-[#005131]">
          <CheckCircle2 className="h-8 w-8 text-[#146B44]" />
        </div>
        <span className="inline-flex rounded-full bg-[#8df5b7]/60 px-3 py-1 text-xs font-bold text-[#005131]">تم التنسيق بنجاح</span>
        <h3 className="text-xl font-bold text-[#101f17]">شهم قبل المشوار</h3>
        <p className="text-sm leading-7 text-[#53645a]">شهم في طريقه إليك الآن، وبيانات التواصل تظل محمية داخل التطبيق.</p>
        <TripSummary trip={trip} />
        <button onClick={() => onCompleteTrip(trip.id)} disabled={tripActionLoading} className="stitch-primary-button w-full px-4 text-base">تم الوصول بأمان ✓</button>
        <button onClick={onReport} className="mx-auto flex min-h-11 items-center justify-center gap-1 text-center text-xs text-[#6B7280] hover:text-[#B53A3A]">
          <AlertTriangle className="h-3.5 w-3.5" />إبلاغ عن مشكلة في المشوار
        </button>
      </>
    )}
  </div>
);
