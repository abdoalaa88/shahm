import React from 'react';
import { Clock } from 'lucide-react';

/** Spinning ring around a clock: shown while a request waits for a شهم to accept it. */
export const PendingLoader: React.FC<{ className?: string }> = ({ className = 'h-40 w-40' }) => (
  <div className={`relative mx-auto flex items-center justify-center ${className}`} role="status" aria-label="بانتظار قبول الطلب">
    <div className="absolute inset-3 rounded-full border-8 border-[#dbece0]" />
    <div className="absolute inset-3 animate-spin rounded-full border-8 border-[#8df5b7] border-t-transparent" />
    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#005131] text-white shadow-lg">
      <Clock className="h-9 w-9 animate-pulse" />
    </div>
  </div>
);
