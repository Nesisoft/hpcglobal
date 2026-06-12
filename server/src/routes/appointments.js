const router  = require('express').Router();
const { z }   = require('zod');

const { validate }    = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const emailService    = require('../services/email');
const { sendSms }     = require('../services/sms');

const prisma = require('../lib/prisma');

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_AHEAD = 21; // how far into the future bookings are offered

const toMin   = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM  = (min)  => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const ymd     = (d)    => d.toISOString().slice(0, 10);

// ─── Public: open slots for the next few weeks ────────────────────────────────
router.get('/slots', async (_req, res) => {
  try {
    const availabilities = await prisma.appointmentAvailability.findMany({ where: { isActive: true } });

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end   = new Date(start); end.setDate(end.getDate() + DAYS_AHEAD);

    const booked = await prisma.appointment.findMany({
      where:  { date: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
      select: { date: true, time: true },
    });
    const takenKey = new Set(booked.map((b) => `${ymd(b.date)}|${b.time}`));

    const now  = new Date();
    const days = [];
    for (let i = 1; i <= DAYS_AHEAD; i++) {
      const day = new Date(start); day.setDate(day.getDate() + i);
      const dow = day.getDay();
      const wins = availabilities.filter((a) => a.dayOfWeek === dow);
      if (!wins.length) continue;

      const slots = [];
      for (const w of wins) {
        for (let t = toMin(w.startTime); t + w.slotMinutes <= toMin(w.endTime); t += w.slotMinutes) {
          const time = toHHMM(t);
          const key  = `${ymd(day)}|${time}`;
          if (takenKey.has(key)) continue;
          if (slots.includes(time)) continue;
          slots.push(time);
        }
      }
      if (slots.length) {
        days.push({ date: ymd(day), label: `${DAY_LABELS[dow]}, ${day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`, slots: slots.sort() });
      }
    }

    const settings = await prisma.siteSettings.findUnique({
      where: { id: 'singleton' }, select: { appointmentReasons: true },
    });
    let reasons = [];
    try { reasons = JSON.parse(settings?.appointmentReasons ?? '[]'); } catch { reasons = []; }

    res.json({ days, reasons });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Public: book an appointment ──────────────────────────────────────────────
const bookSchema = z.object({
  name:   z.string().min(1),
  email:  z.string().email(),
  phone:  z.string().min(1),
  date:   z.string(),  // YYYY-MM-DD
  time:   z.string(),  // HH:mm
  reason: z.string().min(1),
  notes:  z.string().optional(),
});

router.post('/', validate(bookSchema), async (req, res) => {
  try {
    const { name, email, phone, date, time, reason, notes } = req.body;
    const day = new Date(`${date}T00:00:00.000Z`);

    let appt;
    try {
      appt = await prisma.appointment.create({
        data: { name, email, phone, date: day, time, reason, notes },
      });
    } catch (e) {
      if (e.code === 'P2002') {
        return res.status(409).json({ message: 'Sorry, that slot was just taken. Please choose another time.' });
      }
      throw e;
    }

    res.status(201).json({ message: 'Your appointment request has been received.', id: appt.id });

    // Notify the requester + office — non-fatal
    const whenLabel = `${day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${time} GMT`;
    try {
      await emailService.sendAppointmentConfirmation(email, name, whenLabel, reason);
      await sendSms(phone, `HPC Global: Hi ${name}, your appointment request for ${whenLabel} has been received. We will confirm shortly. God bless you.`);
      if (process.env.OFFICE_PHONE) {
        await sendSms(process.env.OFFICE_PHONE, `HPC Appointment: ${name} requested ${whenLabel}. Reason: ${reason}. Phone: ${phone}`);
      }
    } catch (notifyErr) {
      console.error('Appointment notify error (non-fatal):', notifyErr.message);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: list bookings ─────────────────────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const where = { ...(status && { status }) };
    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.appointment.count({ where }),
    ]);
    res.json({ appointments, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: update booking status ─────────────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data:  { status: req.body.status },
    });

    // Notify the requester when confirmed/cancelled — non-fatal
    try {
      const whenLabel = `${new Date(updated.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${updated.time} GMT`;
      if (updated.status === 'CONFIRMED') {
        await emailService.sendAppointmentStatus(updated.email, updated.name, whenLabel, 'confirmed');
        await sendSms(updated.phone, `HPC Global: Hi ${updated.name}, your appointment for ${whenLabel} is CONFIRMED. See you then. God bless you.`);
      } else if (updated.status === 'CANCELLED') {
        await emailService.sendAppointmentStatus(updated.email, updated.name, whenLabel, 'cancelled');
        await sendSms(updated.phone, `HPC Global: Hi ${updated.name}, your appointment for ${whenLabel} has been cancelled. Please contact us to reschedule.`);
      }
    } catch (notifyErr) {
      console.error('Appointment status notify error (non-fatal):', notifyErr.message);
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin: availability CRUD ─────────────────────────────────────────────────
router.get('/availability/all', verifyToken, async (_req, res) => {
  try {
    const availability = await prisma.appointmentAvailability.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    res.json(availability);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

const availabilitySchema = z.object({
  dayOfWeek:   z.number().int().min(0).max(6),
  startTime:   z.string(),
  endTime:     z.string(),
  slotMinutes: z.number().int().positive().default(30),
  isActive:    z.boolean().default(true),
});

router.post('/availability', verifyToken, validate(availabilitySchema), async (req, res) => {
  try {
    const created = await prisma.appointmentAvailability.create({ data: req.body });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/availability/:id', verifyToken, async (req, res) => {
  try {
    await prisma.appointmentAvailability.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
