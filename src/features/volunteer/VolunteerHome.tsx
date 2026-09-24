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
import { ArrowLeft, Handshake } from 'lucide-react';

type VolunteerHomeProps = {
  role: UserRole | undefined;
  onOpenAssistance: () => void;
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
  onOpenAssistance,
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
    {role === 'volunteer' && (
      <button
        type="button"
        onClick={onOpenAssistance}
        className="stitch-soft-card flex min-h-[4.5rem] w-full items-center justify-between gap-3 px-4 py-3 text-center transition-colors hover:bg-[#dbece0]"
      >
        <span className="flex min-w-0 flex-1 flex-col items-center">
          <strong className="text-sm text-[#005131]">طلب عون على الطريق</strong>
          <span className="mt-1 text-xs leading-5 text-[#53645a]">اطلب مساعدة قريبة لو احتجتها</span>
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#146b44] text-white"><Handshake className="h-5 w-5" /></span>
        <ArrowLeft className="h-4 w-4 shrink-0 text-[#005131]" aria-hidden="true" />
      </button>
    )}
    {raceConditionDetected && <RaceConditionToast onClose={onDismissRaceCondition} />}

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
      <LocationPrompt status={volunteerLocationStatus} error={volunteerLocationError} onRequestLocation={onRequestLocation} />
    ) : (
      <div className="space-y-3">
        {nearbyAssistance.length > 0 && (
          <NearbyAssistanceList requests={nearbyAssistance} acceptingAssistanceId={acceptingAssistanceId} onAcceptAssistance={onAcceptAssistance} />
        )}
        <PendingTripsList pendingTrips={pendingTrips} onSelectTrip={onSelectTrip} />
      </div>
    )}

    {selectedTripDetails && (
      <TripDetailsSheet trip={selectedTripDetails} acceptingTripId={acceptingTripId} onAccept={onAcceptTrip} onClose={onCloseTripDetails} />
    )}
  </>
);
