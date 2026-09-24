import React from 'react';
import type { PublicTrip, RequesterRelation } from '../../lib/supabase';
import type { PlaceSelection } from '../../lib/appTypes';
import { RequesterTripCard } from './RequesterTripCard';
import { TripRequestForm } from './TripRequestForm';
import { CheckCircle2 } from 'lucide-react';

type RequesterHomeProps = {
  reportSuccess: boolean;
  activeRequesterTrip: PublicTrip | null;
  tripActionLoading: boolean;
  onCancelTrip: (tripId: string) => void;
  onStartNewRequest: () => void;
  onCompleteTrip: (tripId: string) => void;
  onReport: () => void;
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

export const RequesterHome: React.FC<RequesterHomeProps> = ({
  reportSuccess,
  activeRequesterTrip,
  tripActionLoading,
  onCancelTrip,
  onStartNewRequest,
  onCompleteTrip,
  onReport,
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
  <>
    {reportSuccess && (
      <div className="p-3 bg-[#E6F4ED] text-[#146B44] text-xs rounded-xl flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>تم استلام ملاحظتك بسرية تامة وسيتم مراجعتها من قبل المشرفين.</span>
      </div>
    )}

    {activeRequesterTrip ? (
      <RequesterTripCard
        trip={activeRequesterTrip}
        tripActionLoading={tripActionLoading}
        onCancelTrip={onCancelTrip}
        onStartNewRequest={onStartNewRequest}
        onCompleteTrip={onCompleteTrip}
        onReport={onReport}
      />
    ) : (
      <TripRequestForm
        errorMessage={errorMessage}
        relation={relation}
        passengerCount={passengerCount}
        specialNotes={specialNotes}
        ackChecked={ackChecked}
        createTripLoading={createTripLoading}
        hasOrigin={hasOrigin}
        hasDestination={hasDestination}
        onOriginSelect={onOriginSelect}
        onDestinationSelect={onDestinationSelect}
        onRelationChange={onRelationChange}
        onPassengerCountChange={onPassengerCountChange}
        onSpecialNotesChange={onSpecialNotesChange}
        onAckCheckedChange={onAckCheckedChange}
        onCreateTrip={onCreateTrip}
      />
    )}
  </>
);
