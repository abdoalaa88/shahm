import React from 'react';
import type { NearbyTrip } from '../../lib/supabase';
import { Clock, MapPin, ShieldCheck, Navigation } from 'lucide-react';

type PendingTripsListProps = {
  pendingTrips: NearbyTrip[];
  onSelectTrip: (trip: NearbyTrip) => void;
};

export const PendingTripsList: React.FC<PendingTripsListProps> = ({ pendingTrips, onSelectTrip }) => (
  <>
    <h2 className="text-base font-bold text-[#1F2430] flex items-center justify-between">
      <span>الطلبات المتاحة قربك</span>
      <span className="text-xs font-normal text-[#6B7280]">({pendingTrips.length})</span>
    </h2>

    {pendingTrips.length === 0 ? (
      <div className="stitch-card p-8 text-center space-y-2">
        <Clock className="w-8 h-8 text-[#8A949E] mx-auto" />
        <p className="text-sm font-semibold text-[#1F2430]">مفيش طلبات قريبة منك دلوقتي</p>
        <p className="text-xs text-[#6B7280]">هنبلغك أول ما يظهر طلب جديد في منطقتك</p>
      </div>
    ) : (
      pendingTrips.map((trip) => (
        <div
          key={trip.id}
          onClick={() => onSelectTrip(trip)}
          className="stitch-card p-4 cursor-pointer hover:border-[#146B44] transition-all space-y-2"
        >
          <div className="flex items-center justify-between text-xs text-[#6B7280] flex-wrap gap-1">
            <span className="bg-[#FBEFDC] text-[#8F5A0A] px-2 py-0.5 rounded-md font-medium">
              {trip.requester_relation === 'patient' && 'مريض'}
              {trip.requester_relation === 'guardian' && 'ولي أمر'}
              {trip.requester_relation === 'companion' && 'مرافق'}
            </span>
            <div className="flex items-center gap-2">
              {typeof trip.distance_km === 'number' && (
                <span className="flex items-center gap-1 font-semibold text-[#146B44]">
                  <Navigation className="w-3 h-3" />
                  {trip.distance_km} كم
                </span>
              )}
              <span>
                {new Date(trip.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          <div className="text-sm font-bold text-[#1F2430] flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#146B44] shrink-0" />
            <span>{trip.origin_area_label}</span>
            <span className="text-[#6B7280]">⟶</span>
            <span>{trip.destination_area_label}</span>
          </div>

          <div className="text-xs text-[#3f4942]">عدد الأفراد: {trip.passenger_count ?? 1}</div>
          {trip.special_notes && <div className="rounded-lg bg-[#F7F8F9] px-2 py-1.5 text-xs text-[#3f4942]">ملاحظات: {trip.special_notes}</div>}

          <div className="flex items-center gap-1.5 rounded-lg bg-[#e6f8ec] px-2 py-1.5 text-xs text-[#005131]"><ShieldCheck className="h-3.5 w-3.5" /><span>بيانات الحالة تظهر بعد قبول المشوار فقط</span></div>
        </div>
      ))
    )}
  </>
);
