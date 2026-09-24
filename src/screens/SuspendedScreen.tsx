import React from 'react';
import { Ban } from 'lucide-react';

type SuspendedScreenProps = {
  onSignOut: () => void;
};

export const SuspendedScreen: React.FC<SuspendedScreenProps> = ({ onSignOut }) => (
  <div className="min-h-screen bg-[#F7F8F9] flex flex-col justify-center items-center p-4 text-center">
    <div className="w-16 h-16 bg-[#FCEAEA] text-[#B53A3A] rounded-full flex items-center justify-center mx-auto mb-4">
      <Ban className="w-8 h-8" />
    </div>
    <h2 className="text-lg font-bold text-[#1F2430] mb-2">الحساب غير نشط مؤقتاً</h2>
    <p className="text-xs text-[#6B7280] max-w-xs mb-6 leading-relaxed">
      تم تعليق استخدام هذا الحساب مؤقتاً لمراجعة معايير السلامة والتكافل.
    </p>
    <button onClick={onSignOut} className="text-xs text-[#146B44] font-bold">
      تسجيل الخروج
    </button>
  </div>
);
