const router = require('express').Router();
const { z }  = require('zod');

const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/adminOnly');
const { validate }    = require('../middleware/validate');

const prisma = require('../lib/prisma');
const { withDbRetry, isRetryable } = require('../lib/dbRetry');

// The heads-of-department portal. Admins never come through here — they read and
// review the same reports under /api/admin/reports — so every query below is
// scoped to req.user.id and an id from the client is never trusted on its own.
router.use(verifyToken);
router.use(requireRole('HOD'));

const dbStatus  = (err) => (isRetryable(err) ? 503 : 500);
const dbMessage = (err) =>
  (isRetryable(err)
    ? 'The database is busy right now. Please try again in a moment.'
    : 'Server error');

// ─── Field coercion ───────────────────────────────────────────────────────────
// Number inputs arrive as strings, and a field the HoD left alone arrives as an
// empty string rather than absent — both have to become `undefined` so an
// untouched field is stored as NULL instead of 0.
const blankToUndefined = (v) =>
  (v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? undefined : v);

const optCount = z.preprocess(
  blankToUndefined,
  z.coerce.number({ message: 'Must be a number' }).int('Must be a whole number').min(0).max(1_000_000).optional()
);
const optAmount = z.preprocess(
  blankToUndefined,
  z.coerce.number({ message: 'Must be a number' }).min(0).max(100_000_000).optional()
);
const optText = (max = 5000) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const reportSchema = z
  .object({
    periodType:  z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'EVENT']).default('WEEKLY'),
    periodStart: z.coerce.date({ message: 'Period start is required' }),
    periodEnd:   z.coerce.date({ message: 'Period end is required' }),

    attendanceTotal:    optCount,
    attendanceMale:     optCount,
    attendanceFemale:   optCount,
    attendanceChildren: optCount,
    firstTimers:        optCount,
    newConverts:        optCount,

    absenteeCount: optCount,
    absenteeNames: optText(),
    followUpNotes: optText(),

    // The one narrative field worth insisting on: a report with no account of
    // what the department did says nothing.
    activities: z
      .string({
        required_error:     'Please describe what the department did',
        invalid_type_error: 'Please describe what the department did',
      })
      .trim()
      .min(3, 'Please describe what the department did')
      .max(5000),
    achievements:    optText(),
    issues:          optText(),
    recommendations: optText(),
    prayerRequests:  optText(),
    nextPeriodPlans: optText(),

    offeringAmount: optAmount,
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'Period end cannot be before period start',
    path: ['periodEnd'],
  });

const REPORT_FIELDS = Object.freeze([
  'periodType', 'periodStart', 'periodEnd',
  'attendanceTotal', 'attendanceMale', 'attendanceFemale', 'attendanceChildren',
  'firstTimers', 'newConverts',
  'absenteeCount', 'absenteeNames', 'followUpNotes',
  'activities', 'achievements', 'issues', 'recommendations',
  'prayerRequests', 'nextPeriodPlans', 'offeringAmount',
]);

// Optional fields absent from the payload are written as NULL rather than left
// at their previous value, so clearing a field in the form actually clears it.
function reportData(body) {
  return Object.fromEntries(REPORT_FIELDS.map((f) => [f, body[f] ?? null]));
}

/** The signed-in HoD's own record — the authority on their department. */
async function loadHod(userId) {
  return prisma.adminUser.findUnique({
    where:  { id: userId },
    select: { id: true, name: true, department: true, role: true },
  });
}

// ─── Who am I ─────────────────────────────────────────────────────────────────
// The JWT carries name and role but not department, and a department can be
// renamed after the token was issued, so the portal asks for it.
router.get('/me', async (req, res) => {
  try {
    const hod = await withDbRetry(() => loadHod(req.user.id), { label: 'hod profile' });
    if (!hod) return res.status(404).json({ message: 'Account not found' });
    res.json({ name: hod.name, department: hod.department });
  } catch (err) {
    console.error('HoD profile error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// ─── Submit ───────────────────────────────────────────────────────────────────
router.post('/', validate(reportSchema), async (req, res) => {
  try {
    const hod = await loadHod(req.user.id);
    if (!hod) return res.status(404).json({ message: 'Account not found' });
    if (!hod.department) {
      return res.status(409).json({
        message: 'No department is set on your account. Ask an administrator to add one before reporting.',
      });
    }

    const report = await prisma.departmentReport.create({
      data: {
        ...reportData(req.body),
        hodId:      hod.id,
        // Snapshots: the report stays readable if the department is renamed or
        // the account is later removed.
        hodName:    hod.name,
        department: hod.department,
      },
    });
    res.status(201).json(report);
  } catch (err) {
    console.error('Report submit error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// ─── Own submissions ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const where = { hodId: req.user.id };
    const take  = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
    const skip  = (Math.max(Number(req.query.page) || 1, 1) - 1) * take;

    const { records, total } = await withDbRetry(async () => ({
      records: await prisma.departmentReport.findMany({
        where,
        orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      total: await prisma.departmentReport.count({ where }),
    }), { label: 'hod reports list' });

    res.json({ records, total });
  } catch (err) {
    console.error('HoD reports list error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const report = await withDbRetry(
      // findFirst, not findUnique: the ownership check belongs in the query so
      // there is no window where another HoD's report has been read.
      () => prisma.departmentReport.findFirst({ where: { id: req.params.id, hodId: req.user.id } }),
      { label: 'hod report detail' }
    );
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (err) {
    console.error('HoD report detail error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

// ─── Edit an own submission ───────────────────────────────────────────────────
router.put('/:id', validate(reportSchema), async (req, res) => {
  try {
    const existing = await prisma.departmentReport.findFirst({
      where:  { id: req.params.id, hodId: req.user.id },
      select: { id: true, status: true },
    });
    if (!existing) return res.status(404).json({ message: 'Report not found' });
    if (existing.status === 'REVIEWED') {
      return res.status(409).json({
        message: 'This report has been reviewed and can no longer be edited.',
      });
    }

    const report = await prisma.departmentReport.update({
      where: { id: existing.id },
      data:  reportData(req.body),
    });
    res.json(report);
  } catch (err) {
    console.error('Report update error:', err);
    res.status(dbStatus(err)).json({ message: dbMessage(err) });
  }
});

module.exports = router;
