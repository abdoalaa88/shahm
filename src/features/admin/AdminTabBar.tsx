import React from 'react';
import type { AdminTab } from '../../lib/appTypes';
import { ShieldCheck, LayoutDashboard, ShieldAlert, Server } from 'lucide-react';

type AdminTabBarProps = {
  effectiveAdminTab: AdminTab;
  canViewTrips: boolean | undefined;
  canViewSafety: boolean | undefined;
  canViewAnalytics: boolean | undefined;
  canViewUsage: boolean | undefined;
  canManageUsers: boolean | undefined;
  onSelectTab: (tab: AdminTab) => void;
};

export const AdminTabBar: React.FC<AdminTabBarProps> = ({
  effectiveAdminTab,
  canViewTrips,
  canViewSafety,
  canViewAnalytics,
  canViewUsage,
  canManageUsers,
  onSelectTab,
}) => (
  <div className="max-w-2xl mx-auto flex gap-2 mt-3 pt-2 border-t border-[#8A949E]/10 overflow-x-auto">
    {canViewTrips && (
      <button
        onClick={() => onSelectTab('trips')}
        className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
          effectiveAdminTab === 'trips' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
        }`}
      >
        المشاوير الميدانية
      </button>
    )}
    {canViewSafety && (
      <button
        onClick={() => onSelectTab('safety')}
        className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
          effectiveAdminTab === 'safety' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
        }`}
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        البلاغات والسلامة
      </button>
    )}
    {canViewAnalytics && (
      <button
        onClick={() => onSelectTab('analytics')}
        className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
          effectiveAdminTab === 'analytics' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
        }`}
      >
        <LayoutDashboard className="w-3.5 h-3.5" />
        المؤشرات والتحليلات
      </button>
    )}
    {canViewUsage && (
      <button
        onClick={() => onSelectTab('usage')}
        className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
          effectiveAdminTab === 'usage' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
        }`}
      >
        <Server className="w-3.5 h-3.5" />
        استهلاك الخطة المجانية
      </button>
    )}
    {canManageUsers && (
      <button
        onClick={() => onSelectTab('users')}
        className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1 shrink-0 ${
          effectiveAdminTab === 'users' ? 'bg-[#146B44] text-white' : 'bg-[#F7F8F9] text-[#6B7280]'
        }`}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        إدارة المستخدمين
      </button>
    )}
  </div>
);
