import React from 'react';
import type { AssistanceContactData, ContactCardData, NearbyTrip, UserRole } from '../../lib/supabase';
import type { AssistanceRole, LocationStatus, NearbyAssistanceItem } from '../../lib/appTypes';
import { RaceConditionToast } from '../../components/common/StateViews';
import { ActiveAssistanceHelpCard } from './ActiveAssistanceHelpCard';
import { VolunteerActiveTripCard } from './VolunteerActiveTripCard';
import { LocationPrompt } from './LocationPrompt';
import { NearbyAssistanceList } from './NearbyAssistanceList';
import { PendingTripsList } from './PendingTripsList';
import { TripDetailsSheet } from './TripDetailsSheet';
import { QuoteCard } from '../../components/common/QuoteCard';

type VolunteerHomeProps = {
  role: UserRole | undefined;
  raceConditionDetected: boolean;
  onDismissRaceCondition: () => void;
  activeAssistanceHelp: AssistanceContactData | null;
  assistanceActionLoading: boolean;
  onCompleteAssistance: (assistanceId: string, role: AssistanceRole) => void;
  activeVolunteerTripData: ContactCardData | null;
  tripActionLoading: boolean;
  onCompleteTrip: (tripId: string) => void;
  onCancelTrip: (tripId: string) => void;
  onReport: () => void;
  volunteerLocationStatus: LocationStatus;
  volunteerLocationError: string | null;
  onRequestLocation: () => void;
  nearbyAssistance: NearbyAssistanceItem[];
  acceptingAssistanceId: string | null;
  onAcceptAssistance: (assistanceId: string) => void;
  pendingTrips: NearbyTrip[];
  onSelectTrip: (trip: NearbyTrip) => void;
  selectedTripDetails: NearbyTrip | null;
  acceptingTripId: string | null;
  onAcceptTrip: (tripId: string) => void;
  onCloseTripDetails: () => void;
};

export const VolunteerHome: React.FC<VolunteerHomeProps> = ({
  role,
  raceConditionDetected,
  onDismissRaceCondition,
  activeAssistanceHelp,
  assistanceActionLoading,
  onCompleteAssistance,
  activeVolunteerTripData,
  tripActionLoading,
  onCompleteTrip,
  onCancelTrip,
  onReport,
  volunteerLocationStatus,
  volunteerLocationError,
  onRequestLocation,
  nearbyAssistance,
  acceptingAssistanceId,
  onAcceptAssistance,
  pendingTrips,
  onSelectTrip,
  selectedTripDetails,
  acceptingTripId,
  onAcceptTrip,
  onCloseTripDetails,
}) => (
  <>
    <QuoteCard />
    {raceConditionDetected && (
      <RaceConditionToast onClose={onDismissRaceCondition} />
    )}

    {activeAssistanceHelp && (
      <ActiveAssistanceHelpCard
        help={activeAssistanceHelp}
        assistanceActionLoading={assistanceActionLoading}
        onCompleteAssistance={onCompleteAssistance}
      />
    )}

    {activeVolunteerTripData ? (
      <VolunteerActiveTripCard
        data={activeVolunteerTripData}
        tripActionLoading={tripActionLoading}
        onCompleteTrip={onCompleteTrip}
        onCancelTrip={onCancelTrip}
        onReport={onReport}
      />
    ) : role === 'volunteer' && volunteerLocationStatus !== 'ready' ? (
      <LocationPrompt
        status={volunteerLocationStatus}
        error={volunteerLocationError}
        onRequestLocation={onRequestLocation}
      />
    ) : (
      <div className="space-y-3">
        {nearbyAssistance.length > 0 && (
          <NearbyAssistanceList
            requests={nearbyAssistance}
            acceptingAssistanceId={acceptingAssistanceId}
            onAcceptAssistance={onAcceptAssistance}
          />
        )}
        <PendingTripsList pendingTrips={pendingTrips} onSelectTrip={onSelectTrip} />
      </div>
    )}

    {selectedTripDetails && (
      <TripDetailsSheet
        trip={selectedTripDetails}
        acceptingTripId={acceptingTripId}
        onAccept={onAcceptTrip}
        onClose={onCloseTripDetails}
      />
    )}
  </>
);
