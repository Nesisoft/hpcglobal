const router = require('express').Router();
const { z }   = require('zod');

const { validate }    = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');

const prisma = require('../lib/prisma');

const optionalString = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().optional(),
);
const optionalEmail = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().email().optional(),
);

const visitorSchema = z.object({
  name:         z.string().min(1),
  phone:        z.string().min(1),
  email:        optionalEmail,
  country:      optionalString,
  city:         optionalString,
  source:       optionalString,
  message:      optionalString,
  preferredSvc: optionalString,
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
