const { dateKey, dateOnly, addDays, weekdayOf, todayKey, isDateKey } = require('./time');
const { fullName } = require('./present');
const { presentAttendance } = require('./sessions');

/**
 * Attendance, counted — the numbers the old app never had (it counted rows,
 * never absence or a rate). One place, so a HOD's report, the church-wide one
 * and a session's register always agree.
 *
 * For each worker, over a period:
 * - expected: sessions of services that count towards attendance, not
 *   cancelled, on or after the day they were approved, and finished (or
 *   on now, for those already in);
 * - attended: of those, the ones with an attendance record (GPS, QR or
 *   marked by hand) — on time, late or very late as recorded;
 * - excused: the ones on a day covered by their approved leave, without a
 *   record;
 * - absent: the rest;
 * - rate: attended ÷ (expected − excused), or null when nothing was expected.
 * Attendance at services that don't count (optional ones) is shown on its own.
 */

/** Monday of the week a date falls in, as a date key. */
const weekOf = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));

const MAX_PERIOD_DAYS = 366;

/** The period a report asks for (`from`/`to` date keys); this month so far by default. */
function parsePeriod(query, now = new Date()) {
  const today = todayKey(now);
  const from = isDateKey(query.from) ? query.from : `${today.slice(0, 7)}-01`;
  const to = isDateKey(query.to) ? query.to : today;
  if (to < from) return { error: 'The end of the period is before its start.' };
  if (to > addDays(from, MAX_PERIOD_DAYS - 1)) return { error: 'Choose a period of a year or less.' };
  return { from, to };
}

const rate = (attended, expected, excused) => {
  const due = expected - excused;
  return due > 0 ? Math.round((attended / due) * 1000) / 10 : null;
};

/** The day each worker started counting: when they were approved, else when they signed up. */
const startOf = (w) => dateKey(w.approvedAt ?? w.createdAt);

/** Is `key` inside one of `leaves` (approved, for this worker)? */
const onLeave = (leaves, key) => leaves.some((l) => dateKey(l.startDate) <= key && key <= dateKey(l.endDate));

/** Everything the counts need, in three queries. */
async function loadPeriod(db, { from, to, workerIds, now = new Date() }) {
  const sessions = await db.serviceSession.findMany({
    where:   { cancelled: false, date: { gte: dateOnly(from), lte: dateOnly(to) }, startsAt: { lte: now } },
    include: { service: { select: { id: true, name: true, expected: true } } },
    orderBy: { startsAt: 'asc' },
  });
  const sessionIds = sessions.map((s) => s.id);
  const [attendance, leave] = await Promise.all([
    workerIds.length && sessionIds.length
      ? db.attendance.findMany({ where: { workerId: { in: workerIds }, sessionId: { in: sessionIds } } })
      : [],
    workerIds.length
      ? db.leaveRequest.findMany({
        where: { workerId: { in: workerIds }, status: 'APPROVED', startDate: { lte: dateOnly(to) }, endDate: { gte: dateOnly(from) } },
      })
      : [],
  ]);
  return { sessions, attendance, leave };
}

const blank = () => ({
  expected: 0, attended: 0, onTime: 0, late: 0, veryLate: 0, excused: 0, absent: 0,
  leftEarly: 0, noClockOut: 0, optional: 0,
});

function add(into, from) {
  for (const k of Object.keys(into)) if (typeof from[k] === 'number') into[k] += from[k];
  return into;
}

/**
 * The report for `workers` (each with department, approvedAt, createdAt)
 * from `from` to `to`: a row each, totals, and the week-by-week rate.
 */
async function buildReport(db, { from, to, workers, now = new Date() }) {
  const { sessions, attendance, leave } = await loadPeriod(db, { from, to, workerIds: workers.map((w) => w.id), now });
  const records = new Map(attendance.map((a) => [`${a.workerId}:${a.sessionId}`, a]));
  const leaveOf = new Map();
  for (const l of leave) leaveOf.set(l.workerId, [...(leaveOf.get(l.workerId) ?? []), l]);

  const weeks = new Map();
  const services = new Map();
  const totals = blank();
  const rows = workers.map((w) => {
    const counts = blank();
    const begins = startOf(w);
    for (const s of sessions) {
      const key = dateKey(s.date);
      if (key < begins) continue;
      const a = records.get(`${w.id}:${s.id}`);
      if (!s.service.expected) {
        if (a) counts.optional += 1;
        continue;
      }
      // A service still going on: those already in count; nobody is absent yet.
      if (!a && s.endsAt > now) continue;
      // A week is named by its Monday, or by the period's first day when it starts mid-week.
      const wk = weekOf(key) < from ? from : weekOf(key);
      const week = weeks.get(wk) ?? weeks.set(wk, blank()).get(wk);
      const svc = services.get(s.service.id) ?? services.set(s.service.id, { ...blank(), name: s.service.name }).get(s.service.id);
      counts.expected += 1; week.expected += 1; svc.expected += 1;
      if (a) {
        counts.attended += 1; week.attended += 1; svc.attended += 1;
        if (a.status === 'ON_TIME') svc.onTime += 1;
        if (a.status === 'ON_TIME') counts.onTime += 1;
        else if (a.status === 'LATE') counts.late += 1;
        else counts.veryLate += 1;
        if (a.leftEarlyMinutes) counts.leftEarly += 1;
        if (a.autoClockedOut) counts.noClockOut += 1;
      } else if (onLeave(leaveOf.get(w.id) ?? [], key)) {
        counts.excused += 1; week.excused += 1; svc.excused += 1;
      } else {
        counts.absent += 1; svc.absent += 1;
      }
    }
    add(totals, counts);
    return {
      worker: { id: w.id, name: fullName(w), department: w.department ? { id: w.department.id, name: w.department.name } : null, isHod: w.isHod },
      ...counts,
      rate: rate(counts.attended, counts.expected, counts.excused),
    };
  });

  rows.sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.worker.name.localeCompare(b.worker.name));
  const held = new Map();
  for (const s of sessions) if (s.service.expected) held.set(s.service.id, (held.get(s.service.id) ?? 0) + 1);
  return {
    from,
    to,
    sessions: sessions.filter((s) => s.service.expected).length,
    rows,
    totals: { ...totals, rate: rate(totals.attended, totals.expected, totals.excused) },
    services: [...services.entries()]
      .map(([id, c]) => ({
        id, name: c.name, sessions: held.get(id) ?? 0, expected: c.expected, attended: c.attended, onTime: c.onTime,
        excused: c.excused, absent: c.absent, rate: rate(c.attended, c.expected, c.excused),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    weeks: [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, c]) => ({ week, expected: c.expected, attended: c.attended, excused: c.excused, rate: rate(c.attended, c.expected, c.excused) })),
  };
}

/**
 * One session's register for `workers`: who was present (and how), excused,
 * absent — or, while it is still on, not in yet. Workers who joined after
 * the session aren't on it.
 */
async function buildRegister(db, { session, workers, settings, now = new Date() }) {
  const key = dateKey(session.date);
  const ids = workers.map((w) => w.id);
  const [attendance, leave] = await Promise.all([
    db.attendance.findMany({ where: { sessionId: session.id, workerId: { in: ids } } }),
    db.leaveRequest.findMany({
      where: { workerId: { in: ids }, status: 'APPROVED', startDate: { lte: dateOnly(key) }, endDate: { gte: dateOnly(key) } },
    }),
  ]);
  const byWorker = new Map(attendance.map((a) => [a.workerId, a]));
  const excused = new Set(leave.map((l) => l.workerId));
  const ended = new Date(session.endsAt) <= now;
  const started = new Date(session.startsAt) <= now;

  const rows = workers
    .filter((w) => startOf(w) <= key)
    .map((w) => {
      const a = byWorker.get(w.id) ?? null;
      let state = 'present';
      if (!a) state = excused.has(w.id) ? 'excused' : !started ? 'upcoming' : ended ? 'absent' : 'notIn';
      return {
        worker: { id: w.id, name: fullName(w), department: w.department ? { id: w.department.id, name: w.department.name } : null },
        state,
        attendance: a ? presentAttendance(a, settings) : null,
      };
    });
  const order = { notIn: 0, absent: 1, excused: 2, upcoming: 3, present: 4 };
  rows.sort((a, b) => order[a.state] - order[b.state] || a.worker.name.localeCompare(b.worker.name));
  const counts = rows.reduce((c, r) => ({ ...c, [r.state]: (c[r.state] ?? 0) + 1 }), {});
  return { rows, counts };
}

/** Rows rolled up by department, for the church-wide report. */
function byDepartment(rows) {
  const groups = new Map();
  for (const r of rows) {
    const id = r.worker.department?.id ?? 'none';
    const g = groups.get(id) ?? groups.set(id, { ...blank(), id, name: r.worker.department?.name ?? 'No department', workers: 0 }).get(id);
    g.workers += 1;
    add(g, r);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, rate: rate(g.attended, g.expected, g.excused) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const pct = (v) => (v == null ? '' : `${v}%`);

/** A report as spreadsheet rows: one per worker, then the totals. */
function reportCsvRows(report) {
  const head = ['Name', 'Department', 'Expected', 'Attended', 'On time', 'Late', 'Very late', 'Excused', 'Absent',
    'Left early', 'No clock-out', 'Optional services', 'Attendance'];
  const line = (name, dept, c) => [name, dept, c.expected, c.attended, c.onTime, c.late, c.veryLate, c.excused, c.absent,
    c.leftEarly, c.noClockOut, c.optional, pct(c.rate)];
  return [
    head,
    ...report.rows.map((r) => line(r.worker.name, r.worker.department?.name ?? '', r)),
    line(`Total (${report.from} to ${report.to})`, '', report.totals),
  ];
}

module.exports = { buildReport, buildRegister, byDepartment, reportCsvRows, parsePeriod, weekOf, rate, MAX_PERIOD_DAYS };
