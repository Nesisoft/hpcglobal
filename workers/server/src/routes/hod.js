const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { validate } = require('../middleware/validate');
const { authenticate, requireActive, requireHod, WITH_DEPARTMENT } = require('../middleware/auth');
const { handle } = require('../lib/http');
const { presentWorker } = require('../lib/present');
const { decide } = require('../lib/approval');

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

module.exports = router;
