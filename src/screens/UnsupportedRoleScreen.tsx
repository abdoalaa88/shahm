import React from 'react';
import { AlertCircle } from 'lucide-react';

type UnsupportedRoleScreenProps = {
  onSignOut: () => void;
};

export const UnsupportedRoleScreen: React.FC<UnsupportedRoleScreenProps> = ({ onSignOut }) => (
  <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center p-4 text-center">
    <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#8A949E]/20 space-y-3">
      <AlertCircle className="w-8 h-8 mx-auto text-[#B53A3A]" />
      <h2 className="font-bold text-[#1F2430]">الدور غير مكتمل</h2>
      <p className="text-xs text-[#6B7280]">حسابك لا يحتوي على دور صالح في جدول profiles.</p>
      <button onClick={onSignOut} className="text-xs text-[#146B44] font-bold">تسجيل الخروج</button>
    </div>
  </div>
);
