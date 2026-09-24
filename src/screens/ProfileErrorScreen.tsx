import React from 'react';
import { AlertCircle } from 'lucide-react';

type ProfileErrorScreenProps = {
  message: string;
  onSignOut: () => void;
};

export const ProfileErrorScreen: React.FC<ProfileErrorScreenProps> = ({ message, onSignOut }) => (
  <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center p-4 text-center">
    <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#FCEAEA] space-y-3">
      <AlertCircle className="w-8 h-8 mx-auto text-[#B53A3A]" />
      <h2 className="font-bold text-[#1F2430]">تعذر تحميل دور الحساب</h2>
      <p className="text-xs text-[#6B7280]">{message}</p>
      <button onClick={onSignOut} className="text-xs text-[#146B44] font-bold">تسجيل الخروج</button>
    </div>
  </div>
);
