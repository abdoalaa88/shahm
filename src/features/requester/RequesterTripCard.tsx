import React from 'react';
import type { PublicTrip } from '../../lib/supabase';
import { CheckCircle2, Clock, ShieldCheck, AlertTriangle } from 'lucide-react';

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
}) => (
  <div className="stitch-card p-6 text-center space-y-4">
    {trip.status === 'pending' ? (
      <>
        <div className="relative mx-auto flex h-40 w-40 items-center justify-center">
          <div className="absolute inset-3 rounded-full border-8 border-[#dbece0]" />
          <div className="absolute inset-3 rounded-full border-8 border-[#8df5b7] border-t-transparent animate-spin" />
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#005131] text-white shadow-lg">
            <Clock className="h-9 w-9 animate-pulse" />
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#8df5b7]/50 px-3 py-1 text-xs font-bold text-[#005131]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#006d41]" />
          أكتر من شهم بيشوفوا طلبك دلوقتي
        </span>
        <h3 className="text-xl font-bold text-[#101f17]">أكتر من شهم بيشوفوا طلبك دلوقتي</h3>
        <p className="mx-auto max-w-sm text-sm leading-7 text-[#3f4942]">طلبك ظاهر للشهم القريب دلوقتي، وبيانات التواصل تظل محمية حتى القبول.</p>
        <div className="stitch-soft-card space-y-2 p-4 text-right text-sm">
          <div><strong>من:</strong> {trip.origin_area_label}</div>
          <div><strong>إلى:</strong> {trip.destination_area_label}</div>
        </div>
          <div className="stitch-soft-card flex items-start gap-3 p-4 text-right">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#006d41]" />
            <div><p className="text-sm font-bold text-[#005131]">شهم موثق قريب منك</p><p className="mt-1 text-xs leading-6 text-[#3f4942]">طلبك ظاهر للشهم القريب فقط، وبيانات التواصل تظل محمية حتى القبول.</p></div>
          </div>
        <button
          onClick={() => onCancelTrip(trip.id)}
          disabled={tripActionLoading}
          className="w-full rounded-full bg-[#dbece0] py-3 text-sm font-semibold text-[#005131] transition-colors hover:bg-[#cdded2]"
        >
          إلغاء الطلب
        </button>
      </>
    ) : trip.status === 'expired' ? (
      <>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F7ECD9] text-[#8F5A0A]">
          <Clock className="w-8 h-8" />
        </div>
        <span className="inline-flex rounded-full bg-[#FBEFDC] px-3 py-1 text-xs font-bold text-[#8F5A0A]">انتهت صلاحية الطلب</span>
        <h3 className="text-xl font-bold text-[#101f17]">محدش قبل طلبك خلال ١٥ دقيقة</h3>
        <p className="text-sm leading-7 text-[#3f4942]">ابعت طلب جديد وهيظهر تاني للشهم القريب منك.</p>
        <div className="stitch-soft-card space-y-2 p-4 text-right text-sm">
          <div><strong>من:</strong> {trip.origin_area_label}</div>
          <div><strong>إلى:</strong> {trip.destination_area_label}</div>
        </div>
        <button
          onClick={() => onStartNewRequest()}
          className="stitch-primary-button w-full px-4 text-base"
        >
          ابدأ طلب جديد
        </button>
      </>
    ) : (
      <>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#8df5b7] text-[#005131]">
          <CheckCircle2 className="w-8 h-8 text-[#146B44]" />
        </div>
        <span className="inline-flex rounded-full bg-[#8df5b7]/60 px-3 py-1 text-xs font-bold text-[#005131]">تم التنسيق بنجاح</span>
        <h3 className="text-xl font-bold text-[#101f17]">شهم قبل الرحلة</h3>
        <p className="text-sm leading-7 text-[#3f4942]">شهم في طريقه إليك الآن، وستظل بيانات التواصل محمية داخل التطبيق.</p>
        <div className="stitch-soft-card space-y-2 p-4 text-right text-sm">
          <div><strong>من:</strong> {trip.origin_area_label}</div>
          <div><strong>إلى:</strong> {trip.destination_area_label}</div>
        </div>
        <button
          onClick={() => onCompleteTrip(trip.id)}
          disabled={tripActionLoading}
          className="stitch-primary-button w-full px-4 text-base"
        >
          تم الوصول بأمان ✓
        </button>
        <button
          onClick={() => onReport()}
          className="text-xs text-[#6B7280] hover:text-[#B53A3A] flex items-center justify-center gap-1 mx-auto mt-2"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          إبلاغ عن مشكلة في المشوار
        </button>
      </>
    )}
  </div>
);
