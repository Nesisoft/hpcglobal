const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { validate } = require('../middleware/validate');
const { authenticate, requireActive, requireHod, WITH_DEPARTMENT } = require('../middleware/auth');
const { handle } = require('../lib/http');
const { presentWorker } = require('../lib/present');
const { decide } = require('../lib/approval');
const { getSettings } = require('../lib/settings');
const { todayKey, dateOnly, addDays, isDateKey, isTime } = require('../lib/time');
const { ensureSessions, closeFinished, presentSession } = require('../lib/sessions');
const { buildReport, buildRegister, reportCsvRows, parsePeriod } = require('../lib/reports');
const { sendCsv } = require('../lib/csv');
const { markPresent, removeAttendance, HOD_DAYS_BACK } = require('../lib/marking');
const { presentLeave, reviewLeave, WITH_WORKER } = require('../lib/leave');

// A head of department's tools. Every query is limited to the HOD's own
// department, taken from their account on the server — an id sent by the
// browser is only ever looked up inside that department. (In the old PHP app
// HODs could reach church-wide data through the admin APIs.)
router.use(authenticate, requireActive, requireHod);

const STATUSES = ['PENDING', 'ACTIVE', 'DECLINED', 'SUSPENDED'];

router.get('/members', handle('hod members', async (req, res) => {
  const departmentId = req.worker.departmentId;
  const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;

  const [members, grouped] = await withDbRetry(() => Promise.all([
    prisma.worker.findMany({
      where:   { departmentId, ...(status ? { status } : {}) },
      include: WITH_DEPARTMENT,
      orderBy: [{ status: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.worker.groupBy({ by: ['status'], where: { departmentId }, _count: { _all: true } }),
  ]), { label: 'hod members' });

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const g of grouped) counts[g.status] = g._count._all;
  res.json({ department: req.worker.department, members: members.map(presentWorker), counts });
}));

router.post('/members/:id/approve', handle('hod approve', async (req, res) => {
  const result = await decide(req.worker, req.params.id, { approve: true, departmentId: req.worker.departmentId });
  if (result.status) return res.status(result.status).json({ message: result.message });
  res.json(result);
}));

const declineSchema = z.object({ reason: z.string().trim().max(300, 'Keep the reason under 300 characters').optional() });

router.post('/members/:id/decline', validate(declineSchema), handle('hod decline', async (req, res) => {
  const result = await decide(req.worker, req.params.id, {
    approve: false, reason: req.body.reason, departmentId: req.worker.departmentId,
  });
  if (result.status) return res.status(result.status).json({ message: result.message });
  res.json(result);
}));

// ─── Registers: who came ─────────────────────────────────────────────────────

/** The department's active members — the people a register or report covers. */
const membersOf = (departmentId) => prisma.worker.findMany({
  where:   { departmentId, status: 'ACTIVE' },
  include: WITH_DEPARTMENT,
  orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
});

/** Sessions made, forgotten clock-outs closed: what every register needs first. */
async function prepare(now) {
  const settings = await withDbRetry(() => getSettings(prisma), { label: 'settings' });
  await withDbRetry(() => ensureSessions(prisma), { label: 'ensure sessions' });
  await withDbRetry(() => closeFinished(prisma, settings, now), { label: 'close finished' });
  return settings;
}

/** Today's services, each with the department's register — the view at the door. */
router.get('/today', handle('hod today', async (req, res) => {
  const now = new Date();
  const settings = await prepare(now);
  const [sessions, members] = await withDbRetry(() => Promise.all([
    prisma.serviceSession.findMany({
      where:   { date: dateOnly(todayKey(now)), cancelled: false, service: { active: true } },
      include: { service: true },
      orderBy: { startsAt: 'asc' },
    }),
    membersOf(req.worker.departmentId),
  ]), { label: 'hod today' });
  const registers = [];
  for (const session of sessions) {
    registers.push({
      session:  presentSession(session, settings, now),
      expected: session.service.expected,
      ...(await buildRegister(prisma, { session, workers: members, settings, now })),
    });
  }
  res.json({ department: req.worker.department, members: members.length, markDaysBack: HOD_DAYS_BACK, registers });
}));

/** Past services (up to today), each with how many of the department came. */
router.get('/sessions', handle('hod sessions', async (req, res) => {
  const now = new Date();
  const today = todayKey(now);
  const to = isDateKey(req.query.to) && req.query.to <= today ? req.query.to : today;
  let from = isDateKey(req.query.from) ? req.query.from : addDays(to, -27);
  if (from > to) from = to;
  if (from < addDays(to, -92)) from = addDays(to, -92);
  const settings = await prepare(now);
  const sessions = await withDbRetry(() => prisma.serviceSession.findMany({
    where:   { date: { gte: dateOnly(from), lte: dateOnly(to) }, startsAt: { lte: now } },
    include: { service: true },
    orderBy: { startsAt: 'desc' },
  }));
  const present = sessions.length
    ? await withDbRetry(() => prisma.attendance.groupBy({
      by:     ['sessionId'],
      where:  { sessionId: { in: sessions.map((s) => s.id) }, worker: { departmentId: req.worker.departmentId } },
      _count: { _all: true },
    }))
    : [];
  const counts = new Map(present.map((p) => [p.sessionId, p._count._all]));
  res.json({
    from,
    to,
    markDaysBack: HOD_DAYS_BACK,
    sessions:     sessions.map((s) => ({
      ...presentSession(s, settings, now), expected: s.service.expected, present: counts.get(s.id) ?? 0,
    })),
  });
}));

const findSession = (id) => withDbRetry(() => prisma.serviceSession.findUnique({ where: { id }, include: { service: true } }));

router.get('/sessions/:id', handle('hod register', async (req, res) => {
  const now = new Date();
  const settings = await prepare(now);
  const session = await findSession(req.params.id);
  if (!session) return res.status(404).json({ message: 'That service date wasn’t found.' });
  const members = await withDbRetry(() => membersOf(req.worker.departmentId));
  res.json({
    session:      presentSession(session, settings, now),
    expected:     session.service.expected,
    markDaysBack: HOD_DAYS_BACK,
    ...(await buildRegister(prisma, { session, workers: members, settings, now })),
  });
}));

const reasonText = z.string({ error: 'Give a reason' }).trim().min(3, 'Give a reason').max(300, 'Keep the reason under 300 characters');
const markSchema = z.object({
  workerId:  z.string({ error: 'Choose who to mark' }).min(1, 'Choose who to mark'),
  arrivedAt: z.string({ error: 'Enter when they arrived' }).refine(isTime, 'Enter when they arrived, as HH:MM'),
  leftAt:    z.string().refine(isTime, 'Enter when they left, as HH:MM').optional().nullable(),
  reason:    reasonText,
});

router.post('/sessions/:id/mark', validate(markSchema), handle('hod mark', async (req, res) => {
  const session = await findSession(req.params.id);
  if (!session) return res.status(404).json({ message: 'That service date wasn’t found.' });
  const result = await markPresent(req.worker, session, req.body, { departmentId: req.worker.departmentId, daysBack: HOD_DAYS_BACK });
  if (result.status) return res.status(result.status).json({ message: result.message, field: result.field });
  res.status(201).json(result);
}));

const removeSchema = z.object({ reason: reasonText });

router.post('/attendance/:id/remove', validate(removeSchema), handle('hod remove mark', async (req, res) => {
  const result = await removeAttendance(req.worker, req.params.id, req.body.reason, {
    departmentId: req.worker.departmentId, daysBack: HOD_DAYS_BACK,
  });
  if (result.status) return res.status(result.status).json({ message: result.message });
  res.json(result);
}));

// ─── The department's report ──────────────────────────────────────────────────

/** The report the query asks for, or null once a refusal has been sent. */
async function departmentReport(req, res) {
  const period = parsePeriod(req.query);
  if (period.error) {
    res.status(400).json({ message: period.error });
    return null;
  }
  await prepare(new Date());
  const members = await withDbRetry(() => membersOf(req.worker.departmentId));
  return withDbRetry(() => buildReport(prisma, { ...period, workers: members }), { label: 'hod report' });
}

router.get('/report', handle('hod report', async (req, res) => {
  const report = await departmentReport(req, res);
  if (report) res.json({ department: req.worker.department, ...report });
}));

router.get('/report.csv', handle('hod report csv', async (req, res) => {
  const report = await departmentReport(req, res);
  if (report) sendCsv(res, `${req.worker.department.name}-attendance-${report.from}-to-${report.to}.csv`, reportCsvRows(report));
}));

// ─── Leave ────────────────────────────────────────────────────────────────────

const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

router.get('/leave', handle('hod leave', async (req, res) => {
  const inDepartment = { worker: { departmentId: req.worker.departmentId } };
  const status = LEAVE_STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const [leave, waiting] = await withDbRetry(() => Promise.all([
    prisma.leaveRequest.findMany({
      where:   { ...inDepartment, ...(status ? { status } : {}) },
      include: WITH_WORKER,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      take:    200,
    }),
    prisma.leaveRequest.count({ where: { ...inDepartment, status: 'PENDING' } }),
  ]));
  res.json({ leave: leave.map((l) => presentLeave(l)), waiting });
}));

const reviewSchema = z.object({ note: z.string().trim().max(300, 'Keep the note under 300 characters').optional().nullable() });

for (const [path, approve] of [['approve', true], ['reject', false]]) {
  router.post(`/leave/:id/${path}`, validate(reviewSchema), handle(`hod leave ${path}`, async (req, res) => {
    const result = await reviewLeave(req.worker, req.params.id, { approve, note: req.body.note, departmentId: req.worker.departmentId });
    if (result.status) return res.status(result.status).json({ message: result.message });
    res.json(result);
  }));
}

module.exports = router;
