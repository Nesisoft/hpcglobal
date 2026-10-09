const router = require('express').Router();
const { z }   = require('zod');

const { verifyToken }  = require('../middleware/auth');
const { validate }     = require('../middleware/validate');
const { notifyRegistrant } = require('../services/eventNotify');

const prisma = require('../lib/prisma');

const blankToUndefined = (v) =>
  (typeof v === 'string' && v.trim() === '' ? undefined : v);

const rsvpSchema = z.object({
  name:       z.string().trim().min(1, 'Please enter your name'),
  email:      z.preprocess(blankToUndefined, z.string().trim().email('Please enter a valid email address').optional()),
  phone:      z.preprocess(blankToUndefined, z.string().trim().min(1).optional()),
  attendance: z.enum(['in-person', 'online']).default('in-person'),
});

// GET /api/events — public upcoming
router.get('/', async (req, res) => {
  try {
    const { featured, category } = req.query;
    const where = {
      isPublished: true,
      startDate:   { gte: new Date() },
      ...(featured === 'true' && { isFeatured: true }),
      ...(category && { category }),
    };
    const events = await prisma.event.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/events/:slug — public single
router.get('/:slug', async (req, res) => {
  try {
    const event = await prisma.event.findFirst({
      where: { slug: req.params.slug, isPublished: true },
    });
    if (!event) return res.status(404).json({ message: 'Not found' });
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/events/:id/rsvp — public
router.post('/:id/rsvp', validate(rsvpSchema), async (req, res) => {
  try {
    const { name, email, phone, attendance } = req.body;

    const event = await prisma.event.findUnique({
      where:  { id: req.params.id },
      select: {
        id: true, title: true, slug: true, startDate: true, timeGmt: true,
        venue: true, isOnline: true, joinLink: true,
        requireEmail: true, requirePhone: true, isPublished: true,
      },
    });
    if (!event || !event.isPublished) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Which details this event insists on is the admin's choice per event.
    if (event.requireEmail && !email) {
      return res.status(400).json({ message: 'An email address is required to register for this event' });
    }
    if (event.requirePhone && !phone) {
      return res.status(400).json({ message: 'A phone number is required to register for this event' });
    }
    // Even when both are optional, we need one way to send the confirmation
    // and anything the church sends later.
    if (!email && !phone) {
      return res.status(400).json({ message: 'Please give us either an email address or a phone number' });
    }

    const rsvp = await prisma.eventRsvp.create({
      data: {
        eventId:    event.id,
        name,
        email:      email ?? null,
        phone:      phone ?? null,
        attendance: event.isOnline ? attendance : 'in-person',
      },
    });

    // Confirmations are awaited rather than fired after the response: this runs
    // on a serverless function, which may freeze the moment the response is
    // sent, and work left in flight simply never happens. Bounded and
    // non-fatal — the registration is already saved either way.
    const delivery = await notifyRegistrant(event, rsvp);

    res.status(201).json({ ...rsvp, delivery });
  } catch (err) {
    console.error('RSVP error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
