// Shared vocabulary for department reporting, used by both the HoD portal and
// the admin review page so labels never drift between the two.

export const PERIOD_TYPES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'EVENT'];

export const PERIOD_LABELS = {
  WEEKLY:    'Weekly',
  MONTHLY:   'Monthly',
  QUARTERLY: 'Quarterly',
  EVENT:     'Event / one-off',
};

export const REPORT_STATUSES = ['SUBMITTED', 'REVIEWED'];

export const STATUS_LABELS = {
  SUBMITTED: 'Submitted',
  REVIEWED:  'Reviewed',
};

export const STATUS_COLORS = {
  SUBMITTED: 'bg-gold/10 text-gold',
  REVIEWED:  'bg-green-50 text-green-700',
};

/** Counts shown as a grid of number inputs, in reporting order. */
export const ATTENDANCE_FIELDS = [
  { key: 'attendanceTotal',    label: 'Total attendance' },
  { key: 'attendanceMale',     label: 'Male' },
  { key: 'attendanceFemale',   label: 'Female' },
  { key: 'attendanceChildren', label: 'Children' },
  { key: 'firstTimers',        label: 'First timers' },
  { key: 'newConverts',        label: 'New converts' },
];

/** Free-text sections, in the order a report reads. */
export const NARRATIVE_FIELDS = [
  {
    key: 'activities',
    label: 'Activities carried out',
    hint: 'What the department did during this period.',
    required: true,
    rows: 4,
  },
  { key: 'achievements',    label: 'Achievements / highlights',      rows: 3 },
  { key: 'issues',          label: 'Issues and challenges faced',    rows: 4 },
  { key: 'recommendations', label: 'Recommendations to leadership',  rows: 4 },
  { key: 'prayerRequests',  label: 'Prayer requests',                rows: 3 },
  { key: 'nextPeriodPlans', label: 'Plans for the next period',      rows: 3 },
];

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * A sensible default period for the type just chosen — the week or month that
 * has just finished being reported on, so the common case needs no editing.
 */
export function defaultPeriod(periodType, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (periodType === 'WEEKLY') {
    // Sunday-to-Saturday, the week the given day falls in.
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { periodStart: iso(start), periodEnd: iso(end) };
  }

  if (periodType === 'MONTHLY') {
    return {
      periodStart: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
      periodEnd:   iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    };
  }

  if (periodType === 'QUARTERLY') {
    const q = Math.floor(d.getMonth() / 3);
    return {
      periodStart: iso(new Date(d.getFullYear(), q * 3, 1)),
      periodEnd:   iso(new Date(d.getFullYear(), q * 3 + 3, 0)),
    };
  }

  // EVENT — a single day until the HoD says otherwise.
  return { periodStart: iso(d), periodEnd: iso(d) };
}

export const fmtPeriod = (r) => {
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  const start = new Date(r.periodStart).toLocaleDateString('en-GB', opts);
  const end   = new Date(r.periodEnd).toLocaleDateString('en-GB', opts);
  return start === end ? start : `${start} – ${end}`;
};
