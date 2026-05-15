const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { verifyToken }  = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/service-times — public
router.get('/', async (_req, res) => {
  try {
    const times = await prisma.serviceTime.findMany({
      where:   { isActive: true },
      orderBy: { order: 'asc' },
    });
    res.json(times);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/service-times/:id — admin
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const updated = await prisma.serviceTime.update({
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
