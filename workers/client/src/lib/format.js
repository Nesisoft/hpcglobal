const ACCRA = 'Africa/Accra';

export const formatDate = (value) => (value
  ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ACCRA }).format(new Date(value))
  : '—');

export const formatDateTime = (value) => (value
  ? new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ACCRA,
  }).format(new Date(value))
  : '—');

/** "Good morning" by the time in Accra. */
export function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: ACCRA }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const ROLE_LABEL = { WORKER: 'Worker', ADMIN: 'Administrator', SUPER_ADMIN: 'Super administrator' };
export const STATUS_LABEL = { PENDING: 'Waiting for approval', ACTIVE: 'Active', DECLINED: 'Declined', SUSPENDED: 'Suspended' };
export const GENDER_LABEL = { MALE: 'Male', FEMALE: 'Female' };

/** "Ama Mensah" → "AM" */
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
