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

const ROLE_LABELS: Record<UserRole, string> = {
  volunteer: 'شهم',
  requester: 'مستفيد',
  ops_admin: 'إدارة النظام',
  verification_admin: 'إدارة النظام',
  analytics_viewer: 'إدارة النظام',
  super_admin: 'إدارة النظام',
};

export const AppHeader: React.FC<AppHeaderProps> = ({ firstName, role, canInstall, onInstall, onSignOut, children }) => (
  <header className="stitch-header px-4 pb-5 pt-[calc(0.75rem+env(safe-area-inset-top))]">
    <div className="mx-auto max-w-2xl">
      <div className="flex min-h-11 items-center justify-between gap-2">
        {canInstall ? (
          <button type="button" onClick={onInstall} className="flex min-h-11 items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold text-[#e6f4ed] hover:bg-white/10">
            <Download className="h-4 w-4" />
            تثبيت التطبيق
          </button>
        ) : <span aria-hidden="true" />}
        <button type="button" onClick={onSignOut} className="min-h-11 rounded-full px-3 text-xs font-semibold text-[#e6f4ed] hover:bg-white/10">
          تسجيل الخروج
        </button>
      </div>

      <div className="mt-1 flex flex-col items-center text-center">
        <BrandMark className="h-16 w-16" />
        <span className="mt-1 text-xl font-extrabold tracking-wide text-white">شهم</span>
        <p className="mt-2 text-base font-semibold text-[#e6f4ed]">
          {firstName ? 'أهلاً بك يا ' + firstName + ' في شهم' : 'أهلاً بك في شهم'}
        </p>
        <h1 className="mt-2 text-2xl font-extrabold text-white">الناس للناس</h1>
        <p className="mt-1 max-w-sm text-sm leading-6 text-[#dbece0]">مجتمع يساند بعضه في الطريق، بمحبة وخصوصية وأمان.</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex min-h-8 items-center justify-center rounded-full bg-[#dbece0] px-3 text-xs font-bold text-[#005131]">{role ? ROLE_LABELS[role] : 'حساب شهم'}</span>
          <span className="inline-flex min-h-8 items-center justify-center gap-1 rounded-full bg-[#e6f4ed] px-3 text-xs font-semibold text-[#146b44]">
            <span className="h-2 w-2 rounded-full bg-[#1e8e5a]" aria-hidden="true" />
            متصل
          </span>
        </div>
      </div>
      {children}
    </div>
  </header>
);
