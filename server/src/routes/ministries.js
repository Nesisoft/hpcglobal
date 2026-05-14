const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { verifyToken }  = require('../middleware/auth');

const prisma = new PrismaClient();

router.get('/', async (_req, res) => {
  try {
    const ministries = await prisma.ministry.findMany({
      where:   { isActive: true },
      orderBy: { order: 'asc' },
    });
    res.json(ministries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const ministry = await prisma.ministry.create({ data: req.body });
    res.status(201).json(ministry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  try {
    const ministry = await prisma.ministry.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(ministry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await prisma.ministry.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
