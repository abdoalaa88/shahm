import React from 'react';
import { LocationPicker } from '../../components/common/LocationPicker';
import type { RequesterRelation } from '../../lib/supabase';
import type { PlaceSelection } from '../../lib/appTypes';
import { AlertCircle, Loader2 } from 'lucide-react';

type TripRequestFormProps = {
  errorMessage: string | null;
  relation: RequesterRelation;
  passengerCount: number;
  specialNotes: string;
  ackChecked: boolean;
  createTripLoading: boolean;
  hasOrigin: boolean;
  hasDestination: boolean;
  onOriginSelect: (place: PlaceSelection) => void;
  onDestinationSelect: (place: PlaceSelection) => void;
  onRelationChange: (relation: RequesterRelation) => void;
  onPassengerCountChange: (count: number) => void;
  onSpecialNotesChange: (notes: string) => void;
  onAckCheckedChange: (checked: boolean) => void;
  onCreateTrip: () => void;
};

export const TripRequestForm: React.FC<TripRequestFormProps> = ({
  errorMessage,
  relation,
  passengerCount,
  specialNotes,
  ackChecked,
  createTripLoading,
  hasOrigin,
  hasDestination,
  onOriginSelect,
  onDestinationSelect,
  onRelationChange,
  onPassengerCountChange,
  onSpecialNotesChange,
  onAckCheckedChange,
  onCreateTrip,
}) => (
  <div className="stitch-card p-6 space-y-4">
    <h2 className="text-lg font-bold text-[#1F2430]">طلب رحلة</h2>

    {errorMessage && (
      <div className="p-3 bg-[#FCEAEA] text-[#B53A3A] text-xs rounded-xl flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{errorMessage}</span>
      </div>
    )}

    <LocationPicker
      label="هتتحرك منين؟"
      placeholder="ابحث عن منطقتك أو حيك"
      onSelect={(val) => onOriginSelect(val)}
      allowCurrentLocation
    />

    <LocationPicker
      label="هتروح فين؟"
      placeholder="اسم المستشفى أو المركز الطبي"
      onSelect={(val) => onDestinationSelect(val)}
    />

    <div>
      <label className="block text-sm font-semibold text-[#1F2430] mb-2">الطلب ده لـ:</label>
      <div className="grid grid-cols-3 gap-2">
        {[
          { id: 'patient', label: 'أنا' },
          { id: 'guardian', label: 'شخص تحت رعايتي' },
          { id: 'companion', label: 'مرافقة شخص' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onRelationChange(item.id as RequesterRelation)}
            className={`h-10 text-xs font-semibold rounded-lg border transition-colors ${
              relation === item.id
                ? 'border-[#146B44] bg-[#E6F4ED] text-[#146B44]'
                : 'border-[#8A949E] bg-white text-[#1F2430]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>

    <div>
      <label className="mb-2 block text-sm font-semibold text-[#1F2430]">عدد الأفراد</label>
      <select value={passengerCount} onChange={(event) => onPassengerCountChange(Number(event.target.value))} className="h-11 w-full rounded-xl border border-[#8A949E] bg-white px-3 text-sm text-[#1F2430]">
        {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
      </select>
    </div>

    <div>
      <label className="mb-2 block text-sm font-semibold text-[#1F2430]">ملاحظات</label>
      <textarea value={specialNotes} onChange={(event) => onSpecialNotesChange(event.target.value)} maxLength={500} placeholder="مثال: كرسي متحرك، عكاز، شنط، احتياجات خاصة..." className="min-h-20 w-full rounded-xl border border-[#8A949E] bg-white p-3 text-sm text-[#1F2430] focus:border-[#146B44] focus:outline-none" />
    </div>

    <div className="p-3 bg-[#F7F8F9] rounded-xl border border-[#8A949E]/30 space-y-2">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={ackChecked}
          onChange={(e) => onAckCheckedChange(e.target.checked)}
          className="mt-1 accent-[#146B44] w-4 h-4"
        />
        <span className="text-xs text-[#1F2430] leading-relaxed">
          أقر بأن هذا الطلب لحالة علاجية حقيقية، وأتحمل المسؤولية الكاملة عن دقة البيانات المُدخلة.
        </span>
      </label>
    </div>

    <button
      disabled={!hasOrigin || !hasDestination || !ackChecked || createTripLoading}
      onClick={onCreateTrip}
      className="stitch-primary-button flex w-full items-center justify-center gap-2 px-4 text-center text-base"
    >
      {createTripLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'اطلب رحلة الآن'}
    </button>
  </div>
);
