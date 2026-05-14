const router = require('express').Router();
const { z }   = require('zod');
const { PrismaClient } = require('@prisma/client');
const { validate }    = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');

const prisma = new PrismaClient();

const visitorSchema = z.object({
  name:         z.string().min(1),
  phone:        z.string().min(1),
  email:        z.string().email().optional(),
  country:      z.string().optional(),
  city:         z.string().optional(),
  source:       z.string().optional(),
  message:      z.string().optional(),
  preferredSvc: z.string().optional(),
});

// POST /api/visitors — public (new here form)
router.post('/', validate(visitorSchema), async (req, res) => {
  try {
    const visitor = await prisma.visitor.create({ data: req.body });
    // TODO: send WhatsApp welcome via Hubtel/Arkesel
    // TODO: notify welcome team
    res.status(201).json({ message: 'Welcome! Our team will be in touch soon.', id: visitor.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/visitors — admin
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, source, page = 1, limit = 20 } = req.query;
    const where = {
      ...(status && { status }),
      ...(source && { source }),
    };
    const [visitors, total] = await Promise.all([
      prisma.visitor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.visitor.count({ where }),
    ]);
    res.json({ visitors, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/visitors/:id — admin
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const updated = await prisma.visitor.update({
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
