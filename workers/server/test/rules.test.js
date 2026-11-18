/**
 * The clocking rules on their own, to the minute: no database, no server.
 * lib/clock.js (windows, on time / late / very late, leaving early, short),
 * lib/geo.js (distance from the venue), lib/qr.js (the changing codes),
 * lib/sessions.js datesFor (which dates a service falls on) and lib/time.js.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET ??= 'test-jwt-secret-not-for-production-0123456789';

const { windowOf, phaseOf, clockInState, arrival, departure, isShort } = require('../src/lib/clock');
const { distanceM, atVenue } = require('../src/lib/geo');
const { currentCode, sessionForCode, codeFor, SLOT_MS } = require('../src/lib/qr');
const { datesFor } = require('../src/lib/sessions');
const { isDateKey, monthRange, weekdayOf, spoken, at } = require('../src/lib/time');

const SETTINGS = {
  graceMinutes: 15, veryLateMinutes: 30, opensBeforeMinutes: 60, clockOutAfterMinutes: 60,
  minValidMinutes: 30, leftEarlyMinutes: 15, defaultRadiusM: 100,
};
const SESSION = { startsAt: at('2026-11-15', '07:30'), endsAt: at('2026-11-15', '13:30') };
const minutesAfterStart = (m) => new Date(SESSION.startsAt.getTime() + m * 60000);

test('clock-in opens an hour before the start and closes at the end — not an hour after, as the old app had it', () => {
  const w = windowOf(SESSION, SETTINGS);
  assert.equal(w.opensAt.toISOString(), '2026-11-15T06:30:00.000Z');
  assert.equal(w.closesAt.toISOString(), '2026-11-15T13:30:00.000Z');
  assert.equal(w.clockOutUntil.toISOString(), '2026-11-15T14:30:00.000Z');
  assert.equal(clockInState(SESSION, SETTINGS, minutesAfterStart(-61)), 'early');
  assert.equal(clockInState(SESSION, SETTINGS, minutesAfterStart(-60)), 'ok');
  assert.equal(clockInState(SESSION, SETTINGS, minutesAfterStart(360)), 'ok');
  assert.equal(clockInState(SESSION, SETTINGS, minutesAfterStart(361)), 'closed');
});

test('phases: upcoming, open (early), running, finished', () => {
  assert.equal(phaseOf(SESSION, SETTINGS, minutesAfterStart(-61)), 'upcoming');
  assert.equal(phaseOf(SESSION, SETTINGS, minutesAfterStart(-30)), 'open');
  assert.equal(phaseOf(SESSION, SETTINGS, minutesAfterStart(0)), 'running');
  assert.equal(phaseOf(SESSION, SETTINGS, minutesAfterStart(360)), 'finished');
});

test('on time through the grace period, late to 30 minutes, very late after', () => {
  const at_ = (m) => arrival(SESSION, SETTINGS, minutesAfterStart(m));
  assert.deepEqual(at_(-20), { status: 'ON_TIME', lateMinutes: 0 });
  assert.deepEqual(at_(15), { status: 'ON_TIME', lateMinutes: 15 });
  assert.deepEqual(at_(15.99), { status: 'ON_TIME', lateMinutes: 15 }, 'whole minutes, as the old app counted');
  assert.deepEqual(at_(16), { status: 'LATE', lateMinutes: 16 });
  assert.deepEqual(at_(30), { status: 'LATE', lateMinutes: 30 });
  assert.deepEqual(at_(31), { status: 'VERY_LATE', lateMinutes: 31 });
  // The office's settings decide.
  assert.equal(arrival(SESSION, { ...SETTINGS, graceMinutes: 5 }, minutesAfterStart(6)).status, 'LATE');
});

test('minutes present, leaving early and short attendance', () => {
  const attendance = { clockInAt: minutesAfterStart(0) };
  assert.deepEqual(departure(attendance, SESSION, SETTINGS, minutesAfterStart(360)), { minutesPresent: 360, leftEarlyMinutes: null });
  assert.deepEqual(departure(attendance, SESSION, SETTINGS, minutesAfterStart(345)), { minutesPresent: 345, leftEarlyMinutes: null },
    '15 minutes before the end is not leaving early');
  assert.deepEqual(departure(attendance, SESSION, SETTINGS, minutesAfterStart(344)), { minutesPresent: 344, leftEarlyMinutes: 16 });
  assert.equal(isShort(29, SETTINGS), true);
  assert.equal(isShort(30, SETTINGS), false);
  assert.equal(isShort(null, SETTINGS), false, 'a forgotten clock-out isn’t “short” — the minutes are unknown');
});

test('distance from the venue, with up to 50 m allowed for a phone’s stated inaccuracy', () => {
  // One thousandth of a degree of latitude is about 111 m.
  assert.ok(Math.abs(distanceM(5.610256, -0.076429, 5.611256, -0.076429) - 111) < 1);
  const venue = { latitude: 5.610256, longitude: -0.076429, radiusM: 100 };
  const near = { latitude: 5.610256 + 0.0009, longitude: -0.076429 };   // ~100 m
  assert.equal(atVenue(venue, { ...near, accuracy: 0 }).ok, true);
  const outside = { latitude: 5.610256 + 0.0012, longitude: -0.076429 };   // ~133 m
  assert.equal(atVenue(venue, { ...outside, accuracy: 0 }).ok, false);
  assert.equal(atVenue(venue, { ...outside, accuracy: 40 }).ok, true, 'a 40 m fix is given 40 m');
  const far = { latitude: 5.610256 + 0.0018, longitude: -0.076429 };   // ~200 m
  const vague = atVenue(venue, { ...far, accuracy: 5000 });
  assert.equal(vague.ok, false, 'a fix claiming 5 km accuracy buys no more than 50 m');
  assert.equal(vague.allowedM, 150);
});

test('QR codes: six digits, changing every 30 seconds, good for this slot and the two before', () => {
  const t0 = new Date(Date.UTC(2026, 10, 15, 7, 30, 10));
  const { code, refreshInMs } = currentCode('session-a', t0);
  assert.match(code, /^\d{6}$/);
  assert.equal(refreshInMs, 20000);
  assert.equal(sessionForCode(code, ['session-b', 'session-a'], t0), 'session-a');
  assert.equal(sessionForCode(code, ['session-a'], new Date(t0.getTime() + 2 * SLOT_MS)), 'session-a', 'still good a minute on');
  assert.equal(sessionForCode(code, ['session-a'], new Date(t0.getTime() + 3 * SLOT_MS)), null, 'gone after that');
  assert.equal(sessionForCode(code, ['session-b'], t0), null, 'another session’s code');
  assert.equal(sessionForCode('12345', ['session-a'], t0), null);
  assert.notEqual(codeFor('session-a', 1), codeFor('session-a', 2));
});

test('which dates a service falls on', () => {
  const weekly = { recurrence: 'WEEKLY', weekday: 0, startsOn: null, endsOn: null };
  assert.deepEqual(datesFor(weekly, '2026-11-14', '2026-11-29'), ['2026-11-15', '2026-11-22', '2026-11-29']);
  assert.deepEqual(datesFor({ ...weekly, startsOn: new Date('2026-11-20'), endsOn: new Date('2026-11-25') }, '2026-11-14', '2026-11-29'), ['2026-11-22']);

  const daily = { recurrence: 'DAILY', weekday: null, startsOn: new Date('2026-11-16'), endsOn: new Date('2026-11-18') };
  assert.deepEqual(datesFor(daily, '2026-11-14', '2026-11-29'), ['2026-11-16', '2026-11-17', '2026-11-18']);
  assert.deepEqual(datesFor({ ...daily, startsOn: null }, '2026-11-14', '2026-11-29'), [], 'a daily run needs its first day');

  const once = { recurrence: 'NONE', weekday: null, startsOn: new Date('2026-11-20'), endsOn: null };
  assert.deepEqual(datesFor(once, '2026-11-14', '2026-11-29'), ['2026-11-20']);
  assert.deepEqual(datesFor(once, '2026-11-21', '2026-11-29'), []);
});

test('Accra dates and times', () => {
  assert.equal(isDateKey('2026-02-28'), true);
  assert.equal(isDateKey('2026-02-30'), false);
  assert.equal(isDateKey('2026-2-3'), false);
  assert.deepEqual(monthRange('2026-02'), { first: '2026-02-01', last: '2026-02-28' });
  assert.deepEqual(monthRange('2028-02'), { first: '2028-02-01', last: '2028-02-29' });
  assert.deepEqual(monthRange('2026-12'), { first: '2026-12-01', last: '2026-12-31' });
  assert.equal(weekdayOf('2026-11-15'), 0, 'a Sunday');
  assert.equal(spoken(at('2026-11-15', '07:05')), '7:05');
  assert.equal(spoken(at('2026-11-15', '19:30')), '19:30');
});
