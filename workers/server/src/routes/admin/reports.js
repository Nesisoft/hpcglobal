const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../../lib/prisma');
const { withDbRetry } = require('../../lib/dbRetry');
const { validate } = require('../../middleware/validate');
const { WITH_DEPARTMENT } = require('../../middleware/auth');
const { handle } = require('../../lib/http');
const { getSettings } = require('../../lib/settings');
const { todayKey, dateOnly, isTime } = require('../../lib/time');
const { ensureSessions, closeFinished, presentSession } = require('../../lib/sessions');
const { buildReport, buildRegister, byDepartment, reportCsvRows, parsePeriod } = require('../../lib/reports');
const { sendCsv } = require('../../lib/csv');
const { markPresent, removeAttendance, ADMIN_DAYS_BACK } = require('../../lib/marking');

// The church-wide view: today at a glance, reports by worker, department and
// service, each date's register, and putting attendance right by hand.

async function prepare(now) {
  const settings = await withDbRetry(() => getSettings(prisma), { label: 'settings' });
  await withDbRetry(() => ensureSessions(prisma), { label: 'ensure sessions' });
  await withDbRetry(() => closeFinished(prisma, settings, now), { label: 'close finished' });
  return settings;
}

const departmentOf = (query) => (typeof query.departmentId === 'string' && query.departmentId ? query.departmentId : undefined);

/** Active workers — everyone a report or register counts — optionally one department's. */
const activeWorkers = (departmentId) => prisma.worker.findMany({
  where:   { status: 'ACTIVE', ...(departmentId ? { departmentId } : {}) },
  include: WITH_DEPARTMENT,
  orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard', handle('admin dashboard', async (_req, res) => {
  const now = new Date();
  const today = todayKey(now);
  const settings = await prepare(now);
  const [sessions, workers, pendingWorkers, pendingLeave] = await withDbRetry(() => Promise.all([
    prisma.serviceSession.findMany({
      where:   { date: dateOnly(today), cancelled: false, service: { active: true } },
      include: { service: true },
      orderBy: { startsAt: 'asc' },
    }),
    activeWorkers(),
    prisma.worker.count({ where: { status: 'PENDING' } }),
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
  ]), { label: 'dashboard' });

  const todays = [];
  for (const session of sessions) {
    const { rows, counts } = await buildRegister(prisma, { session, workers, settings, now });
    const late = rows.filter((r) => r.attendance && r.attendance.status !== 'ON_TIME').length;
    todays.push({ session: presentSession(session, settings, now), expected: session.service.expected, counts, late });
  }
  const month = await buildReport(prisma, { from: `${today.slice(0, 7)}-01`, to: today, workers, now });
  res.json({
    workers:   workers.length,
    waiting:   { approvals: pendingWorkers, leave: pendingLeave },
    today:     todays,
    month:     { from: month.from, to: month.to, sessions: month.sessions, totals: month.totals, weeks: month.weeks },
    departments: byDepartment(month.rows),
  });
}));

// ─── Reports ──────────────────────────────────────────────────────────────────

async function churchReport(req, res) {
  const period = parsePeriod(req.query);
  if (period.error) {
    res.status(400).json({ message: period.error });
    return null;
  }
  await prepare(new Date());
  const workers = await withDbRetry(() => activeWorkers(departmentOf(req.query)));
  const report = await withDbRetry(() => buildReport(prisma, { ...period, workers }), { label: 'admin report' });
  return { ...report, departments: byDepartment(report.rows) };
}

router.get('/report', handle('admin report', async (req, res) => {
  const report = await churchReport(req, res);
  if (report) res.json(report);
}));

const pct = (v) => (v == null ? '' : `${v}%`);

router.get('/report.csv', handle('admin report csv', async (req, res) => {
  const report = await churchReport(req, res);
  if (!report) return;
  const span = `${report.from}-to-${report.to}`;
  if (req.query.view === 'departments') {
    return sendCsv(res, `attendance-by-department-${span}.csv`, [
      ['Department', 'Workers', 'Expected', 'Attended', 'On time', 'Late', 'Very late', 'Excused', 'Absent', 'Attendance'],
      ...report.departments.map((d) => [d.name, d.workers, d.expected, d.attended, d.onTime, d.late, d.veryLate, d.excused, d.absent, pct(d.rate)]),
    ]);
  }
  if (req.query.view === 'services') {
    return sendCsv(res, `attendance-by-service-${span}.csv`, [
      ['Service', 'Dates held', 'Expected', 'Attended', 'On time', 'Excused', 'Absent', 'Attendance'],
      ...report.services.map((s) => [s.name, s.sessions, s.expected, s.attended, s.onTime, s.excused, s.absent, pct(s.rate)]),
    ]);
  }
  sendCsv(res, `attendance-by-worker-${span}.csv`, reportCsvRows(report));
}));

// ─── A date's register, and putting it right ──────────────────────────────────

const findSession = (id) => withDbRetry(() => prisma.serviceSession.findUnique({ where: { id }, include: { service: true } }));

router.get('/sessions/:id/register', handle('admin register', async (req, res) => {
  const now = new Date();
  const settings = await prepare(now);
  const session = await findSession(req.params.id);
  if (!session) return res.status(404).json({ message: 'That service date wasn’t found.' });
  const workers = await withDbRetry(() => activeWorkers(departmentOf(req.query)));
  res.json({
    session:      presentSession(session, settings, now),
    expected:     session.service.expected,
    markDaysBack: ADMIN_DAYS_BACK,
    ...(await buildRegister(prisma, { session, workers, settings, now })),
  });
}));

const reasonText = z.string({ error: 'Give a reason' }).trim().min(3, 'Give a reason').max(300, 'Keep the reason under 300 characters');
const markSchema = z.object({
  workerId:  z.string({ error: 'Choose who to mark' }).min(1, 'Choose who to mark'),
  arrivedAt: z.string({ error: 'Enter when they arrived' }).refine(isTime, 'Enter when they arrived, as HH:MM'),
  leftAt:    z.string().refine(isTime, 'Enter when they left, as HH:MM').optional().nullable(),
  reason:    reasonText,
});

router.post('/sessions/:id/attendance', validate(markSchema), handle('admin mark', async (req, res) => {
  const session = await findSession(req.params.id);
  if (!session) return res.status(404).json({ message: 'That service date wasn’t found.' });
  const result = await markPresent(req.worker, session, req.body, { daysBack: ADMIN_DAYS_BACK });
  if (result.status) return res.status(result.status).json({ message: result.message, field: result.field });
  res.status(201).json(result);
}));

router.post('/attendance/:id/remove', validate(z.object({ reason: reasonText })), handle('admin remove attendance', async (req, res) => {
  const result = await removeAttendance(req.worker, req.params.id, req.body.reason, { daysBack: ADMIN_DAYS_BACK });
  if (result.status) return res.status(result.status).json({ message: result.message });
  res.json(result);
}));

module.exports = router;
