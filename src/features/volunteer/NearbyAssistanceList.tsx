import React from 'react';
import type { NearbyAssistanceItem } from '../../lib/appTypes';
import { Loader2 } from 'lucide-react';

type NearbyAssistanceListProps = {
  requests: NearbyAssistanceItem[];
  acceptingAssistanceId: string | null;
  onAcceptAssistance: (assistanceId: string) => void;
};

export const NearbyAssistanceList: React.FC<NearbyAssistanceListProps> = ({ requests, acceptingAssistanceId, onAcceptAssistance }) => (
  <section className="space-y-3">
    <h2 className="text-base font-bold text-[#1F2430]">طلبات عون قريبة منك</h2>
    {requests.map((request) => (
      <div key={request.id} className="stitch-card space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-[#FBEFDC] px-2 py-1 text-xs font-semibold text-[#8F5A0A]">{request.issue_type}</span>
          <span className="text-xs text-[#146B44]">{request.distance_km} كم</span>
        </div>
        <p className="text-sm leading-6 text-[#3f4942]">{request.description}</p>
        <button
          type="button"
          disabled={acceptingAssistanceId === request.id}
          onClick={() => onAcceptAssistance(request.id)}
          className="stitch-primary-button w-full px-4 text-sm"
        >
          {acceptingAssistanceId === request.id ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'الاستجابة لطلب العون'}
        </button>
      </div>
    ))}
  </section>
);
