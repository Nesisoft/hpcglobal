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

// ── Times and dates for services and clocking ─────────────────────────────
// Every moment from the API is an ISO string in UTC, and every date a
// "YYYY-MM-DD" in Accra. Accra is UTC+0 all year, but the zone is still named
// so a phone set to another country's time shows the church's times.

/** Hour (0–23), minute, and the date ("YYYY-MM-DD") of a moment, in Accra. */
export function accraParts(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ACCRA,
  }).formatToParts(new Date(value)).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Today's date in Accra, "YYYY-MM-DD". */
export const accraToday = (now = Date.now()) => accraParts(now).date;

/** 7, 32 → "7:32"; 19, 5 → "19:05" — as the server writes times in its messages. */
export function clockLabel(hour, minute) {
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

/** A moment as "7:32", in Accra. */
export const formatTime = (value) => {
  if (!value) return '—';
  const { hour, minute } = accraParts(value);
  return clockLabel(hour, minute);
};

/** A service's own "07:30" as "7:30". */
export const formatClock = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? clockLabel(h, m) : '—';
};

/** A moment as the "HH:MM" a time box takes, in Accra. */
export const toTimeInput = (value) => {
  if (!value) return '';
  const { hour, minute } = accraParts(value);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/** "7:00 – 9:30" from two moments. */
export const formatTimeRange = (start, end) => `${formatTime(start)} – ${formatTime(end)}`;

// A date alone is read at midday UTC, so no zone can move it to the day before.
const dateOnly = (ymd) => new Date(`${ymd}T12:00:00Z`);

/** "2026-11-16" → "Monday 16 November"; `short` → "Mon 16 Nov"; `year` adds the year. */
export function formatDay(ymd, { short = false, year = false } = {}) {
  if (!ymd) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: short ? 'short' : 'long', day: 'numeric', month: short ? 'short' : 'long',
    ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC',
  }).format(dateOnly(ymd)).replace(',', '');
}

/** "Today", "Tomorrow", "Yesterday", or the day itself. */
export function relativeDay(ymd, today = accraToday()) {
  if (ymd === today) return 'Today';
  if (ymd === addDays(today, 1)) return 'Tomorrow';
  if (ymd === addDays(today, -1)) return 'Yesterday';
  return formatDay(ymd, { year: ymd.slice(0, 4) !== today.slice(0, 4) });
}

/** "2026-11-16" plus 3 days → "2026-11-19". */
export function addDays(ymd, days) {
  const d = dateOnly(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-11" → "November 2026". */
export const formatMonth = (ym) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(dateOnly(`${ym}-15`));

/** "2026-11" moved by -3 months → "2026-08". */
export function addMonths(ym, months) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** 129 → "2 h 9 min"; 45 → "45 min". */
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return '—';
  const total = Math.max(0, Math.round(Number(minutes)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** How long until something, for "Clock-in opens in 25 min". */
export function formatWait(ms) {
  if (ms <= 60000) return 'in under a minute';
  return `in ${formatDuration(Math.ceil(ms / 60000))}`;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const SERVICE_KIND_LABEL = {
  REGULAR: 'Regular service',
  MIDWEEK: 'Midweek service',
  CONFERENCE: 'Conference',
  TRAINING: 'Training',
  SPECIAL: 'Special service',
};

export const METHOD_LABEL = { GPS: 'GPS', QR: 'QR code', MANUAL: 'Manual' };

/** "On time", "18 min late", "Very late · 45 min". */
export function attendanceStatusLabel(attendance) {
  if (!attendance) return '';
  if (attendance.status === 'ON_TIME') return 'On time';
  const late = attendance.lateMinutes ? formatDuration(attendance.lateMinutes) : '';
  if (attendance.status === 'VERY_LATE') return late ? `Very late · ${late}` : 'Very late';
  return late ? `${late} late` : 'Late';
}
