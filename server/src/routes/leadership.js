const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { verifyToken }  = require('../middleware/auth');

const prisma = new PrismaClient();

router.get('/', async (_req, res) => {
  try {
    const profiles = await prisma.leadershipProfile.findMany({
      where:   { isActive: true },
      orderBy: [{ isSenior: 'desc' }, { order: 'asc' }],
    });
    res.json(profiles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const profile = await prisma.leadershipProfile.create({ data: req.body });
    res.status(201).json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  try {
    const profile = await prisma.leadershipProfile.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await prisma.leadershipProfile.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
