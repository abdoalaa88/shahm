export const TRIP_PUBLIC_COLUMNS =
  'id, requester_id, volunteer_id, origin_area_label, destination_area_label, status, requester_relation, scheduled_at, created_at, accepted_at, completed_at, problem_type, people_count, request_notes';

export const ROAD_PROBLEM_TYPES = [
  'عطل ميكانيكي',
  'إطار مثقوب',
  'نفاد الوقود',
  'بطارية السيارة',
  'مشكلة كهربائية',
  'حادث أو طارئ',
  'أخرى',
] as const;

export const getDateTimeInputLimits = () => {
  const now = new Date();
  const minDate = new Date(now.getTime() - 2 * 60 * 1000);
  const maxDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const toLocalInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return {
    min: toLocalInput(minDate),
    max: toLocalInput(maxDate),
    now: toLocalInput(now),
  };
};

export const formatScheduledAt = (value?: string | null) => {
  if (!value) return 'غير محدد';
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'غير محدد';

  return date.toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const formatDistance = (distance?: number | null) => {
  if (distance === null || distance === undefined) return null;
  if (!Number.isFinite(Number(distance))) return null;

  const numericDistance = Number(distance);
  if (numericDistance < 1) return `${Math.round(numericDistance * 1000)} متر`;
  return `${numericDistance.toFixed(1)} كم`;
};

export const formatTimeSince = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return 'الآن';
  if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  return `منذ ${Math.round(diffHours / 24)} يوم`;
};

export const hasCompleteVolunteerVehicleDetails = (candidate: any) =>
  typeof candidate?.vehicle_type === 'string' && candidate.vehicle_type.trim().length >= 2 &&
  typeof candidate?.vehicle_color === 'string' && candidate.vehicle_color.trim().length >= 2 &&
  typeof candidate?.vehicle_plate_number === 'string' && candidate.vehicle_plate_number.trim().length >= 3 &&
  candidate?.vehicle_data_responsibility_ack === true;

export const installDismissedStorageKey = 'shahm.install-dismissed.v1';

export const readBooleanPreference = (key: string) => {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

export const writeBooleanPreference = (key: string) => {
  try {
    window.localStorage.setItem(key, 'true');
  } catch {
    // The UI continues to work for browsers that block local storage.
  }
};
