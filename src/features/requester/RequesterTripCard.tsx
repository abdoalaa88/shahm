import React from 'react';
import type { PublicTrip } from '../../lib/supabase';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { PendingLoader } from '../../components/common/PendingLoader';
import { TripSummary } from '../../components/common/TripSummary';

type RequesterTripCardProps = {
  trip: PublicTrip;
  tripActionLoading: boolean;
  onCancelTrip: (tripId: string) => void;
  onStartNewRequest: () => void;
  onCompleteTrip: (tripId: string) => void;
  onReport: () => void;
};

export const RequesterTripCard: React.FC<RequesterTripCardProps> = ({
  trip,
  tripActionLoading,
  onCancelTrip,
  onStartNewRequest,
  onCompleteTrip,
  onReport,
}) => {
  const summary = (footnote?: string) => (
    <TripSummary
      origin={trip.origin_area_label}
      destination={trip.destination_area_label}
      relation={trip.requester_relation}
      passengerCount={trip.passenger_count}
      notes={trip.special_notes}
      footnote={footnote}
    />
  );

  return (
    <div className="stitch-card space-y-4 p-6 text-center">
      {trip.status === 'pending' ? (
        <>
          <PendingLoader />
          <span className="inline-flex items-center gap-2 rounded-full bg-[#8df5b7]/50 px-3 py-1 text-xs font-bold text-[#005131]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#006d41]" />
            بانتظار شهم
          </span>
          <h3 className="text-xl font-bold text-[#101f17]">أكتر من شهم بيشوفوا طلبك دلوقتي</h3>
          {summary('طلبك ظاهر للشهم القريب فقط، وبيانات التواصل تظل محمية حتى القبول.')}
          <button
            onClick={() => onCancelTrip(trip.id)}
            disabled={tripActionLoading}
            className="w-full rounded-full bg-[#dbece0] py-3 text-center text-sm font-semibold text-[#005131] transition-colors hover:bg-[#cdded2]"
          >
            إلغاء الطلب
          </button>
        </>
      ) : trip.status === 'expired' ? (
        <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F7ECD9] text-[#8F5A0A]">
            <Clock className="h-8 w-8" />
          </div>
          <span className="inline-flex rounded-full bg-[#FBEFDC] px-3 py-1 text-xs font-bold text-[#8F5A0A]">انتهت صلاحية الطلب</span>
          <h3 className="text-xl font-bold text-[#101f17]">محدش قبل طلبك خلال ١٥ دقيقة</h3>
          <p className="text-sm leading-7 text-[#3f4942]">ابعت طلب جديد وهيظهر تاني للشهم القريب منك.</p>
          {summary()}
          <button onClick={() => onStartNewRequest()} className="stitch-primary-button w-full px-4 text-center text-base">
            ابدأ طلب جديد
          </button>
        </>
      ) : (
        <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#8df5b7] text-[#005131]">
            <CheckCircle2 className="h-8 w-8 text-[#146B44]" />
          </div>
          <span className="inline-flex rounded-full bg-[#8df5b7]/60 px-3 py-1 text-xs font-bold text-[#005131]">تم التنسيق بنجاح</span>
          <h3 className="text-xl font-bold text-[#101f17]">شهم قبل الرحلة</h3>
          <p className="text-sm leading-7 text-[#3f4942]">شهم في طريقه إليك الآن، وستظل بيانات التواصل محمية داخل التطبيق.</p>
          {summary()}
          <button
            onClick={() => onCompleteTrip(trip.id)}
            disabled={tripActionLoading}
            className="stitch-primary-button w-full px-4 text-center text-base"
          >
            تم الوصول بأمان ✓
          </button>
          <button
            onClick={() => onReport()}
            className="mx-auto mt-2 flex items-center justify-center gap-1 text-center text-xs text-[#6B7280] hover:text-[#B53A3A]"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            إبلاغ عن مشكلة في المشوار
          </button>
        </>
      )}
    </div>
  );
};
