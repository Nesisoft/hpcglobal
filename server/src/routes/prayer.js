const router = require('express').Router();
const { z }   = require('zod');

const { validate }     = require('../middleware/validate');
const { verifyToken }  = require('../middleware/auth');
const emailService     = require('../services/email');
const { sendSms }      = require('../services/sms');

const prisma = require('../lib/prisma');

const optionalString = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().optional(),
);
const optionalEmail = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().email().optional(),
);

const prayerSchema = z.object({
  name:      optionalString,
  phone:     optionalString,
  email:     optionalEmail,
  category:  z.enum(['HEALTH','FAMILY','FINANCE','CAREER','SPIRITUAL','RELATIONSHIPS','OTHER']),
  request:   z.string().min(10).max(1000),
  wantsCall: z.boolean().default(false),
  isPrivate: z.boolean().default(true),
});

// POST /api/prayer — public
router.post('/', validate(prayerSchema), async (req, res) => {
  try {
    const prayer = await prisma.prayerRequest.create({ data: req.body });
    res.status(201).json({ message: 'Prayer request received', id: prayer.id });

    // Notify office + confirm to the requester — non-fatal
    try {
      await emailService.notifyPrayerRequest(prayer);
      if (prayer.wantsCall && process.env.OFFICE_PHONE) {
        const who = prayer.name ? `${prayer.name}` : 'Anonymous';
        await sendSms(
          process.env.OFFICE_PHONE,
          `HPC Prayer: ${who} requests a call. Category: ${prayer.category}. Phone: ${prayer.phone || 'N/A'}`
        );
      }
      // Confirmation to the requester (if they shared contact details)
      if (prayer.email) {
        await emailService.sendPrayerConfirmation(prayer.email, prayer.name);
      }
      if (prayer.phone) {
        await sendSms(
          prayer.phone,
          `HPC Global: ${prayer.name ? `Hi ${prayer.name}, ` : ''}we have received your prayer request and our team is praying with you. God bless you.`
        );
      }
    } catch (notifyErr) {
      console.error('Prayer notify error (non-fatal):', notifyErr.message);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/prayer (admin only)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, category, page = 1, limit = 20 } = req.query;
    const where = {
      ...(status   && { status }),
      ...(category && { category }),
    };
    const [requests, total] = await Promise.all([
      prisma.prayerRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.prayerRequest.count({ where }),
    ]);
    res.json({ requests, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/prayer/:id — admin
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const updated = await prisma.prayerRequest.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
