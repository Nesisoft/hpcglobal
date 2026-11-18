const router = require('express').Router();
const { z }  = require('zod');

const prisma = require('../lib/prisma');
const { withDbRetry } = require('../lib/dbRetry');
const { validate } = require('../middleware/validate');
const { authenticate, requireActive } = require('../middleware/auth');
const { handle } = require('../lib/http');
const { publicKey, endpointProblem } = require('../lib/push');

// Turning clock-out reminders on and off for this phone.
router.use(authenticate, requireActive);

// A person's phones and browsers with reminders on; the oldest go beyond this.
const MAX_PER_WORKER = 5;

/** The key a phone needs to subscribe — null when reminders aren't set up on the server. */
router.get('/key', (_req, res) => res.json({ publicKey: publicKey() }));

const b64url = (label) => z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/, `Bad ${label}`).min(8).max(200);
const endpointField = z.string({ error: 'Missing push address' }).min(10).max(1000);
const subscribeSchema = z.object({
  endpoint: endpointField,
  keys:     z.object({ p256dh: b64url('key'), auth: b64url('secret') }),
});

router.post('/subscribe', validate(subscribeSchema), handle('push subscribe', async (req, res) => {
  if (!publicKey()) return res.status(503).json({ message: 'Reminders aren’t switched on yet.' });
  const problem = endpointProblem(req.body.endpoint);
  if (problem) return res.status(400).json({ message: problem });
  const { endpoint, keys } = req.body;
  // The same phone signed in as someone else: it is theirs now.
  await withDbRetry(() => prisma.pushSubscription.upsert({
    where:  { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, workerId: req.worker.id },
    update: { p256dh: keys.p256dh, auth: keys.auth, workerId: req.worker.id },
  }));
  const mine = await withDbRetry(() => prisma.pushSubscription.findMany({
    where: { workerId: req.worker.id }, orderBy: { createdAt: 'desc' }, select: { id: true },
  }));
  if (mine.length > MAX_PER_WORKER) {
    await withDbRetry(() => prisma.pushSubscription.deleteMany({ where: { id: { in: mine.slice(MAX_PER_WORKER).map((s) => s.id) } } }));
  }
  res.json({ on: true });
}));

const endpointSchema = z.object({ endpoint: endpointField });

/** Whether this phone has reminders on for the person signed in. */
router.post('/status', validate(endpointSchema), handle('push status', async (req, res) => {
  const found = await withDbRetry(() => prisma.pushSubscription.count({ where: { endpoint: req.body.endpoint, workerId: req.worker.id } }));
  res.json({ on: found > 0 });
}));

router.post('/unsubscribe', validate(endpointSchema), handle('push unsubscribe', async (req, res) => {
  await withDbRetry(() => prisma.pushSubscription.deleteMany({ where: { endpoint: req.body.endpoint, workerId: req.worker.id } }));
  res.json({ on: false });
}));

module.exports = router;
