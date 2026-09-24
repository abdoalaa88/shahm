import React from 'react';
import type { LocationStatus } from '../../lib/appTypes';
import { Loader2, LocateFixed } from 'lucide-react';

type LocationPromptProps = {
  status: LocationStatus;
  error: string | null;
  onRequestLocation: () => void;
};

export const LocationPrompt: React.FC<LocationPromptProps> = ({ status, error, onRequestLocation }) => (
  <div className="stitch-card p-8 text-center space-y-3">
    <LocateFixed className="w-8 h-8 text-[#146B44] mx-auto" />
    <p className="text-sm font-semibold text-[#1F2430]">محتاجين نعرف موقعك الحالي</p>
    <p className="text-xs text-[#6B7280]">
      عشان نطلعلك الطلبات القريبة منك
    </p>
    {error && (
      <p className="text-xs text-[#B53A3A]">{error}</p>
    )}
    <button
      onClick={onRequestLocation}
      disabled={status === 'loading'}
      className="h-11 px-5 bg-[#146B44] text-white rounded-xl text-sm font-semibold flex items-center gap-2 mx-auto disabled:opacity-50"
    >
      {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
      تفعيل الموقع
    </button>
  </div>
);
