// An expired trip is still "the requester's latest trip", so the expiry poll
// and realtime refetch in useRoleSubscriptions would keep resurrecting its
// "expired" card after the requester tapped "ابدأ طلب جديد". Remember which
// expired trips the requester already dismissed so they stay dismissed
// (including across reloads).
const STORAGE_KEY = 'shahm:dismissed-expired-trips';
const MAX_REMEMBERED = 20;

const read = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

export const isExpiredTripDismissed = (tripId: string): boolean => read().includes(tripId);

export const dismissExpiredTrip = (tripId: string): void => {
  try {
    const ids = read().filter((id) => id !== tripId);
    ids.push(tripId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_REMEMBERED)));
  } catch {
    // Storage unavailable (private mode etc.) — worst case the card reappears.
  }
};
