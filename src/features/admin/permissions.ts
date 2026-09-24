import type { UserRole } from '../../lib/supabase';
import type { AdminTab } from '../../lib/appTypes';

export const ADMIN_ROLES = ['ops_admin', 'verification_admin', 'analytics_viewer', 'super_admin'];

export function getAdminAccess(role: UserRole | undefined, adminTab: AdminTab) {
  const isAdmin = role && ADMIN_ROLES.includes(role);
  // Per-role permissions: super_admin sees everything and is the only role
  // that can manage/delete users. ops_admin runs day-to-day operations.
  // verification_admin only reviews reports/verification. analytics_viewer
  // only sees aggregate stats.
  const canViewTrips = role && ['ops_admin', 'super_admin'].includes(role);
  const canViewSafety = role && ['ops_admin', 'verification_admin', 'super_admin'].includes(role);
  const canViewAnalytics = role && ['ops_admin', 'analytics_viewer', 'super_admin'].includes(role);
  const canViewUsage = role && ['ops_admin', 'super_admin'].includes(role);
  const canManageUsers = role === 'super_admin';
  // Fall back to the first tab this role is actually allowed to see, so a
  // role without trips access (e.g. analytics_viewer) never lands on a
  // blank screen just because 'trips' is the state's default value.
  const availableAdminTabs: Array<'trips' | 'safety' | 'analytics' | 'usage' | 'users'> = [
    ...(canViewTrips ? (['trips'] as const) : []),
    ...(canViewSafety ? (['safety'] as const) : []),
    ...(canViewAnalytics ? (['analytics'] as const) : []),
    ...(canViewUsage ? (['usage'] as const) : []),
    ...(canManageUsers ? (['users'] as const) : []),
  ];
  const effectiveAdminTab = availableAdminTabs.includes(adminTab) ? adminTab : availableAdminTabs[0];

  return {
    isAdmin,
    canViewTrips,
    canViewSafety,
    canViewAnalytics,
    canViewUsage,
    canManageUsers,
    effectiveAdminTab,
  };
}
