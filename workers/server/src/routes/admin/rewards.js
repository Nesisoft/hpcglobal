const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../../lib/prisma');
const { withDbRetry } = require('../../lib/dbRetry');
const { validate } = require('../../middleware/validate');
const { WITH_DEPARTMENT } = require('../../middleware/auth');
const { handle } = require('../../lib/http');
const { transaction } = require('../../lib/tx');
const { audit } = require('../../lib/audit');
const { fullName } = require('../../lib/present');
const { dateOnly, addDays } = require('../../lib/time');
const { progressOf, presentReward, presentClaim, rewardFields } = require('../../lib/rewards');

// Rewards for attendance: define them, see everyone's progress, and record
// handing one over — once per person.

const WITH_SERVICE = { service: { select: { id: true, name: true } }, _count: { select: { claims: true } } };
const MAX_SPAN_DAYS = 366;

/** The problem with a reward's dates or service, or null. */
async function rewardProblem({ startsOn, endsOn, serviceId }) {
  if (endsOn < startsOn) return { field: 'endsOn', message: 'The last day is before the first.' };
  if (endsOn > addDays(startsOn, MAX_SPAN_DAYS - 1)) return { field: 'endsOn', message: 'A reward can run for a year at most.' };
  if (serviceId) {
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return { field: 'serviceId', message: 'Choose a service.' };
  }
  return null;
}

const toData = (body) => ({
  ...(body.name !== undefined ? { name: body.name } : {}),
  ...(body.description !== undefined ? { description: body.description || null } : {}),
  ...(body.serviceId !== undefined ? { serviceId: body.serviceId || null } : {}),
  ...(body.target !== undefined ? { target: body.target } : {}),
  ...(body.onTimeOnly !== undefined ? { onTimeOnly: body.onTimeOnly } : {}),
  ...(body.startsOn !== undefined ? { startsOn: dateOnly(body.startsOn) } : {}),
  ...(body.endsOn !== undefined ? { endsOn: dateOnly(body.endsOn) } : {}),
  ...(body.active !== undefined ? { active: body.active } : {}),
});

router.get('/rewards', handle('admin rewards', async (_req, res) => {
  const rewards = await withDbRetry(() => prisma.reward.findMany({ include: WITH_SERVICE, orderBy: [{ active: 'desc' }, { endsOn: 'desc' }] }));
  res.json({ rewards: rewards.map((r) => presentReward(r)) });
}));

router.post('/rewards', validate(rewardFields), handle('admin add reward', async (req, res) => {
  const problem = await rewardProblem(req.body);
  if (problem) return res.status(400).json(problem);
  const reward = await transaction(async (tx) => {
    const created = await tx.reward.create({ data: { ...toData(req.body), createdByName: fullName(req.worker) }, include: WITH_SERVICE });
    await audit(tx, req.worker, {
      action: 'reward.create', targetType: 'reward', targetId: created.id,
      summary: `Added the reward “${created.name}”: ${created.target} attendances, ${req.body.startsOn} to ${req.body.endsOn}`,
    });
    return created;
  });
  res.status(201).json({ reward: presentReward(reward) });
}));

router.patch('/rewards/:id', validate(rewardFields.partial()), handle('admin edit reward', async (req, res) => {
  const before = await withDbRetry(() => prisma.reward.findUnique({ where: { id: req.params.id } }));
  if (!before) return res.status(404).json({ message: 'That reward wasn’t found.' });
  const current = presentReward(before);
  const problem = await rewardProblem({
    startsOn:  req.body.startsOn ?? current.startsOn,
    endsOn:    req.body.endsOn ?? current.endsOn,
    serviceId: req.body.serviceId,
  });
  if (problem) return res.status(400).json(problem);
  const reward = await transaction(async (tx) => {
    const after = await tx.reward.update({ where: { id: before.id }, data: toData(req.body), include: WITH_SERVICE });
    await audit(tx, req.worker, { action: 'reward.update', targetType: 'reward', targetId: after.id, summary: `Edited the reward “${after.name}”` });
    return after;
  });
  res.json({ reward: presentReward(reward) });
}));

/** One reward, with every active worker's progress — closest first — and who has had it. */
router.get('/rewards/:id', handle('admin reward', async (req, res) => {
  const reward = await withDbRetry(() => prisma.reward.findUnique({
    where:   { id: req.params.id },
    include: { ...WITH_SERVICE, claims: true },
  }));
  if (!reward) return res.status(404).json({ message: 'That reward wasn’t found.' });
  const workers = await withDbRetry(() => prisma.worker.findMany({
    where:   { OR: [{ status: 'ACTIVE' }, { id: { in: reward.claims.map((c) => c.workerId) } }] },
    include: WITH_DEPARTMENT,
  }));
  const progress = await withDbRetry(() => progressOf(prisma, reward, workers.map((w) => w.id)));
  const claims = new Map(reward.claims.map((c) => [c.workerId, c]));
  const rows = workers
    .map((w) => ({
      worker:     { id: w.id, name: fullName(w), department: w.department ? { id: w.department.id, name: w.department.name } : null },
      progress:   progress.get(w.id) ?? 0,
      earned:     (progress.get(w.id) ?? 0) >= reward.target,
      handedOver: presentClaim(claims.get(w.id)) ?? null,
    }))
    .filter((r) => r.progress > 0 || r.handedOver)
    .sort((a, b) => b.progress - a.progress || a.worker.name.localeCompare(b.worker.name));
  res.json({ reward: presentReward(reward), rows });
}));

const handOverSchema = z.object({ workerId: z.string({ error: 'Choose who' }).min(1, 'Choose who') });

router.post('/rewards/:id/hand-over', validate(handOverSchema), handle('admin hand over reward', async (req, res) => {
  const reward = await withDbRetry(() => prisma.reward.findUnique({ where: { id: req.params.id } }));
  if (!reward) return res.status(404).json({ message: 'That reward wasn’t found.' });
  const worker = await withDbRetry(() => prisma.worker.findUnique({ where: { id: req.body.workerId } }));
  if (!worker) return res.status(404).json({ message: 'That worker wasn’t found.' });
  const progress = (await withDbRetry(() => progressOf(prisma, reward, [worker.id]))).get(worker.id) ?? 0;
  if (progress < reward.target) {
    return res.status(400).json({ message: `${fullName(worker)} has ${progress} of the ${reward.target} needed — not earned yet.` });
  }
  try {
    const claim = await transaction(async (tx) => {
      const created = await tx.rewardClaim.create({
        data: { rewardId: reward.id, workerId: worker.id, handedOverById: req.worker.id, handedOverByName: fullName(req.worker) },
      });
      await audit(tx, req.worker, {
        action: 'reward.handOver', targetType: 'reward', targetId: reward.id,
        summary: `Handed “${reward.name}” to ${fullName(worker)} (${progress} of ${reward.target})`,
      });
      return created;
    });
    res.status(201).json({ handedOver: presentClaim(claim) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: `${fullName(worker)} has already been given this reward.` });
    throw err;
  }
}));

module.exports = router;
