const router = require('express').Router();
const { z }   = require('zod');
const { PrismaClient } = require('@prisma/client');
const { validate }     = require('../middleware/validate');
const { verifyToken }  = require('../middleware/auth');

const prisma = new PrismaClient();

const prayerSchema = z.object({
  name:      z.string().optional(),
  phone:     z.string().optional(),
  email:     z.string().email().optional(),
  category:  z.enum(['HEALTH','FAMILY','FINANCE','CAREER','SPIRITUAL','RELATIONSHIPS','OTHER']),
  request:   z.string().min(10).max(1000),
  wantsCall: z.boolean().default(false),
  isPrivate: z.boolean().default(true),
});

// POST /api/prayer — public
router.post('/', validate(prayerSchema), async (req, res) => {
  try {
    const prayer = await prisma.prayerRequest.create({ data: req.body });
    // TODO: notify prayer coordinator via SMS/email
    res.status(201).json({ message: 'Prayer request received', id: prayer.id });
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
