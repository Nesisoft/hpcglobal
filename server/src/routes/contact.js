const router = require('express').Router();
const { z }   = require('zod');

const { validate }    = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const email        = require('../services/email');
const { sendSms }  = require('../services/sms');

const prisma = require('../lib/prisma');

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
    await prisma.contactMessage.create({ data: req.body });
  } catch (err) {
    console.error('Contact DB error:', err);
    return res.status(500).json({ message: 'Server error' });
  }

  try {
    await email.sendAutoReply(req.body.email, req.body.name);
    await email.notifyOffice(req.body);
    if (process.env.OFFICE_PHONE) {
      await sendSms(
        process.env.OFFICE_PHONE,
        `HPC Contact: ${req.body.name} (${req.body.type}). Phone: ${req.body.phone || 'N/A'}. Check your email for details.`
      );
    }
    // Confirm to the sender by SMS if they shared a phone number
    if (req.body.phone) {
      await sendSms(
        req.body.phone,
        `HPC Global: Hi ${req.body.name}, we have received your message and will respond within 24 hours. God bless you.`
      );
    }
  } catch (emailErr) {
    console.error('Contact notify error (non-fatal):', emailErr.message);
  }

  res.status(201).json({ message: 'Message received. We will respond within 24 hours.' });
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
