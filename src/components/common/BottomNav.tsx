import React from 'react';
import { BookOpen, CarFront, Handshake, UserRound } from 'lucide-react';
import type { AppTab } from '../../lib/appTypes';

export const BottomNav: React.FC<{ active: AppTab; onChange: (tab: AppTab) => void; showRequest: boolean }> = ({ active, onChange, showRequest }) => {
  const items = [
    { id: 'trips' as const, label: 'المشاوير', icon: CarFront },
    { id: 'request' as const, label: 'طلب عون', icon: Handshake },
    { id: 'guides' as const, label: 'الإرشادات', icon: BookOpen },
    { id: 'account' as const, label: 'حسابي', icon: UserRound },
  ].filter((item) => showRequest || item.id !== 'request');

  return (
    <nav className="stitch-bottom-nav fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]" aria-label="التنقل الرئيسي">
      <div className="mx-auto flex h-[72px] max-w-2xl items-stretch">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active === id ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 border-s border-[#146b44]/10 text-center text-xs transition-colors first:border-s-0 ${active === id ? 'bg-[#e6f8ec] font-bold text-[#005131]' : 'text-[#3f4942]'}`}
          >
            <Icon className="h-6 w-6" strokeWidth={active === id ? 2.4 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
