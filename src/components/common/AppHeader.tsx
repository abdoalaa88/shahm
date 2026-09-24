import React from 'react';
import type { UserRole } from '../../lib/supabase';
import { BrandMark } from './BrandMark';
import { Download } from 'lucide-react';

type AppHeaderProps = {
  firstName: string | undefined;
  role: UserRole | undefined;
  canInstall: boolean;
  onInstall: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
};

export const AppHeader: React.FC<AppHeaderProps> = ({ firstName, role, canInstall, onInstall, onSignOut, children }) => (
  <header className="stitch-header sticky top-0 z-40 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
    <div className="max-w-2xl mx-auto flex justify-between items-center">
      <div className="flex items-center gap-2 min-w-0">
        <BrandMark className="h-10 w-10 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#005131]">شَهْم</span>
            <span className="rounded-full bg-[#8df5b7] px-2 py-0.5 text-[11px] font-semibold text-[#005131]">متصل</span>
          </div>
          <span className="block truncate text-xs text-[#3f4942]">أهلاً، {firstName}</span>
        </div>
        <span className="text-xs bg-[#E6F4ED] text-[#146B44] px-2 py-0.5 rounded-full font-medium">
          {role === 'volunteer' ? 'شهم' : role === 'requester' ? 'مستفيد' : 'إدارة النظام'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {canInstall && (
          <button onClick={onInstall} className="text-xs text-[#146B44] font-semibold flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />
            تثبيت التطبيق
          </button>
        )}
        <button onClick={onSignOut} className="text-xs text-[#6B7280] hover:text-[#1F2430]">
          تسجيل الخروج
        </button>
      </div>
    </div>
    {children}
  </header>
);
