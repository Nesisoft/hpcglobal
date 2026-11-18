/**
 * The clocking rules, as plain functions of a session, the office's settings
 * and the time — so they can be tested to the minute without a database.
 * Carried over from the old app's clock-in.php and clock-out.php, with its
 * mistakes put right (see the notes below).
 */

const MINUTE = 60 * 1000;

/**
 * When a session can be clocked into and out of.
 * - Clock-in opens `opensBeforeMinutes` before the start and closes at the
 *   end. (The old app let people clock in for an hour after a service had
 *   finished.)
 * - Clock-out stays open `clockOutAfterMinutes` after the end; after that,
 *   anyone still clocked in is closed automatically (sessions.js).
 */
function windowOf(session, settings) {
  const startsAt = new Date(session.startsAt).getTime();
  const endsAt   = new Date(session.endsAt).getTime();
  return {
    opensAt:       new Date(startsAt - settings.opensBeforeMinutes * MINUTE),
    closesAt:      new Date(endsAt),
    clockOutUntil: new Date(endsAt + settings.clockOutAfterMinutes * MINUTE),
  };
}

/** upcoming (before clock-in opens) · open (early) · running · finished. */
function phaseOf(session, settings, now = new Date()) {
  const t = now.getTime();
  const { opensAt } = windowOf(session, settings);
  if (t < opensAt.getTime()) return 'upcoming';
  if (t < new Date(session.startsAt).getTime()) return 'open';
  if (t < new Date(session.endsAt).getTime()) return 'running';
  return 'finished';
}

/** Whether a clock-in now is allowed: 'early' | 'ok' | 'closed'. */
function clockInState(session, settings, now = new Date()) {
  const { opensAt, closesAt } = windowOf(session, settings);
  if (now < opensAt) return 'early';
  if (now > closesAt) return 'closed';
  return 'ok';
}

/**
 * On time, late or very late, by whole minutes after the start. Within the
 * grace period counts as on time; the minutes are kept either way, so a report
 * can still say "3 minutes after the start".
 */
function arrival(session, settings, now = new Date()) {
  const lateMinutes = Math.max(0, Math.floor((now.getTime() - new Date(session.startsAt).getTime()) / MINUTE));
  let status = 'ON_TIME';
  if (lateMinutes > settings.veryLateMinutes) status = 'VERY_LATE';
  else if (lateMinutes > settings.graceMinutes) status = 'LATE';
  return { status, lateMinutes };
}

/**
 * Minutes present, and how early they left. Leaving early is recorded beside
 * the arrival status rather than replacing it, as the old app did, so a worker
 * who came late and left early shows as both.
 */
function departure(attendance, session, settings, now = new Date()) {
  const minutesPresent = Math.max(0, Math.floor((now.getTime() - new Date(attendance.clockInAt).getTime()) / MINUTE));
  const early = Math.floor((new Date(session.endsAt).getTime() - now.getTime()) / MINUTE);
  return { minutesPresent, leftEarlyMinutes: early > settings.leftEarlyMinutes ? early : null };
}

/** Too little time between clock-in and clock-out to count as a full attendance. */
const isShort = (minutesPresent, settings) => minutesPresent != null && minutesPresent < settings.minValidMinutes;

module.exports = { windowOf, phaseOf, clockInState, arrival, departure, isShort };
