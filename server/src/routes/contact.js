const router = require('express').Router();
const { z }   = require('zod');
const { PrismaClient } = require('@prisma/client');
const { validate }    = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const email = require('../services/email');

const prisma = new PrismaClient();

const messageSchema = z.object({
  name:    z.string().min(1),
  email:   z.string().email(),
  phone:   z.string().optional(),
  type:    z.string(),
  message: z.string().min(10),
});

// POST /api/contact/message — public
router.post('/message', validate(messageSchema), async (req, res) => {
  try {
    const msg = await prisma.contactMessage.create({ data: req.body });
    // Auto-reply to sender
    await email.sendAutoReply(req.body.email, req.body.name);
    // Notify church office
    await email.notifyOffice(req.body);
    res.status(201).json({ message: 'Message received. We will respond within 24 hours.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/contact/messages — admin
router.get('/messages', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [messages, total] = await Promise.all([
      prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.contactMessage.count(),
    ]);
    res.json({ messages, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/contact/messages/:id — mark read
router.put('/messages/:id', verifyToken, async (req, res) => {
  try {
    const msg = await prisma.contactMessage.update({
      where: { id: req.params.id },
      data:  { isRead: true },
    });
    res.json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
