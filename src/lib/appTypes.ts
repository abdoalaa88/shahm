export type AppTab = 'trips' | 'request' | 'guides' | 'account';
export type AdminTab = 'trips' | 'safety' | 'analytics' | 'usage' | 'users';
export type PlaceSelection = { areaLabel: string; fullAddress: string; lat: number; lng: number };
export type AssistanceRole = 'helper' | 'requester';
export type LocationStatus = 'idle' | 'loading' | 'ready' | 'error';
export type NearbyAssistanceItem = { id: string; issue_type: string; description: string; distance_km: number };

export type AuthMode = 'login' | 'setup';
