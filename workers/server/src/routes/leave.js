const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { validate } = require('../middleware/validate');
const { authenticate, requireActive } = require('../middleware/auth');
const { handle } = require('../lib/http');
const { TYPES, presentLeave, requestLeave, cancelLeave, BACKDATE_DAYS, MAX_SPAN_DAYS } = require('../lib/leave');

// A worker's own leave: ask to be excused, see what was decided, withdraw.
router.use(authenticate, requireActive);

router.get('/', handle('my leave', async (req, res) => {
  const leave = await withDbRetry(() => prisma.leaveRequest.findMany({
    where:   { workerId: req.worker.id },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    take:    100,
  }));
  res.json({ leave: leave.map((l) => presentLeave(l)), rules: { backdateDays: BACKDATE_DAYS, maxSpanDays: MAX_SPAN_DAYS } });
}));

const requestSchema = z.object({
  type:      z.enum(TYPES, { error: 'Choose the kind of leave' }),
  startDate: z.string({ error: 'Choose the first day' }),
  endDate:   z.string({ error: 'Choose the last day' }),
  reason:    z.string({ error: 'Say briefly why' }).trim().min(3, 'Say briefly why').max(500, 'Keep it under 500 characters'),
});

router.post('/', validate(requestSchema), handle('request leave', async (req, res) => {
  const result = await requestLeave(req.worker, req.body);
  if (result.status) return res.status(result.status).json({ message: result.message, field: result.field });
  res.status(201).json(result);
}));

router.post('/:id/cancel', handle('cancel leave', async (req, res) => {
  const result = await cancelLeave(req.worker, req.params.id);
  if (result.status) return res.status(result.status).json({ message: result.message });
  res.json(result);
}));

module.exports = router;
