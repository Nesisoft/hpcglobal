const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../../lib/prisma');
const { withDbRetry } = require('../../lib/dbRetry');
const { validate } = require('../../middleware/validate');
const { handle } = require('../../lib/http');
const { presentLeave, reviewLeave, WITH_WORKER } = require('../../lib/leave');

// Every leave request in the church. Heads of department see their own
// department's at /api/hod/leave; the office sees all, and reviews the HODs'.

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

router.get('/leave', handle('admin leave', async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const departmentId = typeof req.query.departmentId === 'string' && req.query.departmentId ? req.query.departmentId : undefined;
  const where = { ...(status ? { status } : {}), ...(departmentId ? { worker: { departmentId } } : {}) };
  const [leave, waiting] = await withDbRetry(() => Promise.all([
    prisma.leaveRequest.findMany({ where, include: WITH_WORKER, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], take: 300 }),
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
  ]));
  res.json({ leave: leave.map((l) => presentLeave(l)), waiting });
}));

const reviewSchema = z.object({ note: z.string().trim().max(300, 'Keep the note under 300 characters').optional().nullable() });

for (const [path, approve] of [['approve', true], ['reject', false]]) {
  router.post(`/leave/:id/${path}`, validate(reviewSchema), handle(`admin leave ${path}`, async (req, res) => {
    const result = await reviewLeave(req.worker, req.params.id, { approve, note: req.body.note });
    if (result.status) return res.status(result.status).json({ message: result.message });
    res.json(result);
  }));
}

module.exports = router;
