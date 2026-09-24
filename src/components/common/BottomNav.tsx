import React from 'react';
import { BookOpen, CarFront, UserRound } from 'lucide-react';
import type { AppTab } from '../../lib/appTypes';

const items = [
  { id: 'account' as const, label: 'حسابي', icon: UserRound },
  { id: 'guides' as const, label: 'الإرشادات', icon: BookOpen },
  { id: 'trips' as const, label: 'المشاوير', icon: CarFront },
];

export const BottomNav: React.FC<{ active: AppTab; onChange: (tab: AppTab) => void }> = ({ active, onChange }) => (
  <nav className="stitch-bottom-nav fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]" aria-label="التنقل الرئيسي">
    <div className="mx-auto grid h-[4.5rem] max-w-2xl grid-cols-3">
      {items.map(({ id, label, icon: Icon }, index) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={active === id ? 'page' : undefined}
          className={'flex min-h-14 flex-col items-center justify-center gap-1 text-center text-xs transition-colors ' + (index < items.length - 1 ? 'border-l border-[#e4ece6] ' : '') + (active === id ? 'font-bold text-[#005131]' : 'text-[#53645a]')}
        >
          <Icon className="h-5 w-5" strokeWidth={active === id ? 2.4 : 1.8} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  </nav>
);
