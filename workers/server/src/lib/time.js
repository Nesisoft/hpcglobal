/**
 * Dates and times, Accra.
 *
 * Ghana keeps GMT all year — no daylight saving — so Accra's wall clock is
 * UTC. That one fact is relied on here and nowhere else: a service at 07:30
 * starts at 07:30Z, and "today" is the UTC date. If it ever changed, this is
 * the file to change.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HH_MM    = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "2026-11-15" for an instant. */
const dateKey = (instant) => new Date(instant).toISOString().slice(0, 10);

/** Today's date in Accra. */
const todayKey = (now = new Date()) => dateKey(now);

/** A real calendar date ("2026-02-30" is not). */
const isDateKey = (s) => typeof s === 'string' && DATE_KEY.test(s) && dateKey(`${s}T00:00:00Z`) === s;

const isTime = (s) => typeof s === 'string' && HH_MM.test(s);

/** The date as Prisma stores a @db.Date: midnight UTC. */
const dateOnly = (key) => new Date(`${key}T00:00:00.000Z`);

/** The instant a wall-clock time falls on a date. */
const at = (key, hhmm) => new Date(`${key}T${hhmm}:00.000Z`);

const addDays = (key, n) => dateKey(dateOnly(key).getTime() + n * DAY_MS);

/** 0 = Sunday … 6 = Saturday. */
const weekdayOf = (key) => dateOnly(key).getUTCDay();

/** "07:30" from an instant. */
const timeOf = (instant) => new Date(instant).toISOString().slice(11, 16);

/** "7:30" or "19:05" — as people read a time in a message. */
const spoken = (instant) => {
  const [h, m] = timeOf(instant).split(':');
  return `${Number(h)}:${m}`;
};

/** Every date from `from` to `to`, both included. */
function datesBetween(from, to) {
  const out = [];
  for (let key = from; key <= to; key = addDays(key, 1)) out.push(key);
  return out;
}

/** "2026-11" → the first and last date of that month. */
function monthRange(month) {
  const first = `${month}-01`;
  const next  = dateKey(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  return { first, last: addDays(next, -1) };
}

module.exports = {
  DAY_MS, dateKey, todayKey, isDateKey, isTime, dateOnly, at, addDays, weekdayOf, timeOf, spoken, datesBetween, monthRange,
};
