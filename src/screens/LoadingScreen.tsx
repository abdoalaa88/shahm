import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center p-4 text-[#6B7280]">
    <div className="flex items-center gap-2 text-sm" role="status">
      <Loader2 className="w-5 h-5 animate-spin text-[#146B44]" />
      جاري تحميل الحساب...
    </div>
  </div>
);
