import React from 'react';
import { toWhatsAppNumber } from '../../lib/phone';
import type { AssistanceContactData } from '../../lib/supabase';
import type { AssistanceRole } from '../../lib/appTypes';
import { Phone, MessageSquare, Map } from 'lucide-react';

type ActiveAssistanceHelpCardProps = {
  help: AssistanceContactData;
  assistanceActionLoading: boolean;
  onCompleteAssistance: (assistanceId: string, role: AssistanceRole) => void;
};

export const ActiveAssistanceHelpCard: React.FC<ActiveAssistanceHelpCardProps> = ({ help, assistanceActionLoading, onCompleteAssistance }) => (
  <div className="stitch-card space-y-3 p-5">
    <div className="flex items-center justify-between gap-3">
      <span className="rounded-full bg-[#FBEFDC] px-2 py-1 text-xs font-semibold text-[#8F5A0A]">بتساعد في طلب عون</span>
      <span className="rounded-full bg-[#FBEFDC] px-2 py-1 text-xs font-semibold text-[#8F5A0A]">{help.issue_type}</span>
    </div>
    <h3 className="text-base font-bold text-[#101f17]">{help.requester_first_name}</h3>
    <p className="text-sm leading-6 text-[#3f4942]">{help.description}</p>
    <div className="grid grid-cols-2 gap-2">
      <a
        href={`tel:${help.requester_phone}`}
        className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#146B44] text-xs font-semibold text-white active:bg-[#0F5636]"
      >
        <Phone className="w-4 h-4" />
        اتصال
      </a>
      <a
        href={`https://wa.me/${toWhatsAppNumber(help.requester_phone)}`}
        target="_blank"
        rel="noreferrer"
        className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#1E8E5A] text-xs font-semibold text-white active:bg-[#0F5636]"
      >
        <MessageSquare className="w-4 h-4" />
        واتساب
      </a>
    </div>
    <a
      href={`https://maps.google.com/?q=${help.lat},${help.lng}`}
      target="_blank"
      rel="noreferrer"
      className="flex h-12 w-full items-center justify-center gap-1 rounded-xl bg-[#2F6FED] text-xs font-semibold text-white"
    >
      <Map className="w-4 h-4" />
      الخرائط
    </a>
    <button
      type="button"
      disabled={assistanceActionLoading}
      onClick={() => onCompleteAssistance(help.assistance_id, 'helper')}
      className="stitch-primary-button w-full px-4 text-sm"
    >
      تم مساعدته ✓
    </button>
  </div>
);
