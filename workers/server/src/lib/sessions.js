const { todayKey, addDays, dateOnly, dateKey, at, weekdayOf, datesBetween } = require('./time');
const { windowOf, phaseOf, isShort } = require('./clock');
const { hasLocation } = require('./geo');

/**
 * Service dates, made automatically. The old app had an admin "activate"
 * every service date by hand; here each active service's dates for the coming
 * fortnight are created as they are needed — whenever a worker opens the app,
 * an admin opens the sessions list, and once a day by Vercel's cron. Creating
 * is idempotent (unique per service and date), so a date that exists — or was
 * cancelled — is never made twice or brought back.
 */

const AHEAD_DAYS = 14;

/** The dates `service` falls on between `from` and `to` (date keys, inclusive). */
function datesFor(service, from, to) {
  const startsOn = service.startsOn ? dateKey(service.startsOn) : null;
  const endsOn   = service.endsOn ? dateKey(service.endsOn) : null;
  const lo = startsOn && startsOn > from ? startsOn : from;
  const hi = endsOn && endsOn < to ? endsOn : to;
  if (lo > hi) return [];

  switch (service.recurrence) {
    case 'WEEKLY': return datesBetween(lo, hi).filter((key) => weekdayOf(key) === service.weekday);
    case 'DAILY':  return startsOn ? datesBetween(lo, hi) : [];
    case 'NONE':   return startsOn && startsOn >= from && startsOn <= to ? [startsOn] : [];
    default:       return [];
  }
}

const sessionRow = (service, key) => ({
  serviceId: service.id,
  date:      dateOnly(key),
  startsAt:  at(key, service.startTime),
  endsAt:    at(key, service.endTime),
});

// Made recently enough on this server instance: skip the database round trip.
// A change to a service clears it (forgetMade), and other instances catch up
// within a few minutes — the cron and the next request see to it.
let madeUntil = { key: null, at: 0 };
const REMAKE_AFTER_MS = 5 * 60 * 1000;
const forgetMade = () => { madeUntil = { key: null, at: 0 }; };

/** Make sure every active service's sessions exist from `from` to `to`. */
async function ensureSessions(db, { from = todayKey(), to = addDays(todayKey(), AHEAD_DAYS) } = {}) {
  const stamp = `${from}..${to}`;
  if (madeUntil.key === stamp && Date.now() - madeUntil.at < REMAKE_AFTER_MS) return;
  const services = await db.service.findMany({ where: { active: true } });
  const rows = services.flatMap((service) => datesFor(service, from, to).map((key) => sessionRow(service, key)));
  if (rows.length) await db.serviceSession.createMany({ data: rows, skipDuplicates: true });
  madeUntil = { key: stamp, at: Date.now() };
}

/**
 * Close attendance left open after the clock-out time has passed: the worker
 * clocked in at the venue and forgot to clock out. They count as attended,
 * with the minutes unknown — the old app instead set the clock-out time to the
 * clock-in time, which read as nought minutes.
 */
async function closeFinished(db, settings, now = new Date()) {
  const cutoff = new Date(now.getTime() - settings.clockOutAfterMinutes * 60 * 1000);
  return db.attendance.updateMany({
    where: { clockOutAt: null, autoClockedOut: false, session: { endsAt: { lt: cutoff } } },
    data:  { autoClockedOut: true },
  });
}

// ─── What the API shows ───────────────────────────────────────────────────────

function presentSession(session, settings, now = new Date()) {
  const service = session.service;
  return {
    id:        session.id,
    date:      dateKey(session.date),
    startsAt:  session.startsAt,
    endsAt:    session.endsAt,
    cancelled: session.cancelled,
    note:      session.note ?? null,
    custom:    session.custom,
    service:   service && {
      id:          service.id,
      name:        service.name,
      kind:        service.kind,
      venueName:   service.venueName ?? null,
      hasLocation: hasLocation(service),
      radiusM:     service.radiusM,
    },
    window: windowOf(session, settings),
    phase:  phaseOf(session, settings, now),
    ...(session._count ? { counts: { clockedIn: session._count.attendance } } : {}),
  };
}

function presentAttendance(a, settings) {
  return {
    id:               a.id,
    sessionId:        a.sessionId,
    clockInAt:        a.clockInAt,
    clockOutAt:       a.clockOutAt ?? null,
    method:           a.method,
    clockOutMethod:   a.clockOutMethod ?? null,
    status:           a.status,
    lateMinutes:      a.lateMinutes,
    minutesPresent:   a.minutesPresent ?? null,
    leftEarlyMinutes: a.leftEarlyMinutes ?? null,
    short:            isShort(a.minutesPresent, settings),
    autoClockedOut:   a.autoClockedOut,
    distanceM:        a.clockInDistance ?? null,
    markedByName:     a.markedByName ?? null,
  };
}

module.exports = {
  AHEAD_DAYS, datesFor, ensureSessions, forgetMade, closeFinished, presentSession, presentAttendance,
};
