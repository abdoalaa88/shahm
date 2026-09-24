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
  /** Sign-out lives in the header only for roles without the bottom nav (admins). */
  showSignOut: boolean;
  children: React.ReactNode;
};

const roleLabel = (role: UserRole | undefined) =>
  role === 'volunteer' ? 'شهم' : role === 'requester' ? 'مستفيد' : 'إدارة النظام';

export const AppHeader: React.FC<AppHeaderProps> = ({ firstName, role, canInstall, onInstall, onSignOut, showSignOut, children }) => (
  <>
    <header className="stitch-header px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-1 text-center">
        <BrandMark className="h-16 w-16" />
        <span className="text-xl font-bold text-[#005131]">شَهْم</span>
        <p className="text-sm text-[#3f4942]">أهلاً بك{firstName ? ` يا ${firstName}` : ''} في شهم</p>
        <p className="text-lg font-bold text-[#005131]">الناس للناس</p>
        <p className="max-w-xs text-xs leading-6 text-[#3f4942]">منصة تكافلية غير ربحية لنقل الحالات العلاجية</p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="min-w-[4.5rem] rounded-full bg-[#E6F4ED] px-3 py-1 text-center text-xs font-semibold text-[#146B44]">{roleLabel(role)}</span>
          <span className="min-w-[4.5rem] rounded-full bg-[#8df5b7] px-3 py-1 text-center text-xs font-semibold text-[#005131]">متصل</span>
        </div>
        {(canInstall || showSignOut) && (
          <div className="mt-1 flex items-center justify-center gap-4">
            {canInstall && (
              <button onClick={onInstall} className="flex items-center justify-center gap-1 text-center text-xs font-semibold text-[#146B44]">
                <Download className="h-3.5 w-3.5" />
                تثبيت التطبيق
              </button>
            )}
            {showSignOut && (
              <button onClick={onSignOut} className="text-center text-xs text-[#6B7280] hover:text-[#1F2430]">
                تسجيل الخروج
              </button>
            )}
          </div>
        )}
      </div>
    </header>
    {children && <div className="stitch-header sticky top-0 z-40 pt-[env(safe-area-inset-top)]">{children}</div>}
  </>
);
