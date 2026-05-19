import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, MapPin, Wifi, Clock, ChevronLeft, CheckCircle, ExternalLink } from 'lucide-react';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import RichContent from '../../components/ui/RichContent';

const CATEGORY_COLORS = {
  SERVICE:    'bg-purple-brand/10 text-purple-brand',
  CONFERENCE: 'bg-gold/10 text-gold',
  YOUTH:      'bg-blue-50 text-blue-600',
  WOMENS:     'bg-pink-50 text-pink-600',
  MENS:       'bg-slate-100 text-slate-600',
  ONLINE:     'bg-emerald-50 text-emerald-600',
  OTHER:      'bg-cream text-ink/60',
};
const CATEGORY_LABELS = {
  SERVICE:'Service', CONFERENCE:'Conference', YOUTH:'Youth',
  WOMENS:"Women's", MENS:"Men's", ONLINE:'Online', OTHER:'Other',
};

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState({});

  useEffect(() => {
    if (!targetDate) return;
    const calc = () => {
      const diff = new Date(targetDate) - new Date();
      if (diff <= 0) { setTimeLeft({ done: true }); return; }
      setTimeLeft({
        days:    Math.floor(diff / 86400000),
        hours:   Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}

function CountdownBlock({ label, value }) {
  return (
    <div className="text-center">
      <div className="bg-white/10 rounded-xl px-4 py-3 min-w-[60px]">
        <p className="font-display text-3xl text-white leading-none">{String(value).padStart(2, '0')}</p>
        <p className="text-white/50 text-[10px] font-body uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  );
}

const RSVP_EMPTY = { name: '', email: '', phone: '', attendance: 'in-person' };

export default function EventDetail() {
  const { slug } = useParams();
  const fetchFn = useCallback(() => publicApi.getEvent(slug), [slug]);
  const { data: event, loading, error } = useApi(fetchFn);

  const countdown = useCountdown(event?.startDate);

  const [form, setForm]           = useState(RSVP_EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [rsvpError, setRsvpError]   = useState('');

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleRsvp(e) {
    e.preventDefault();
    if (!form.name || !form.phone) { setRsvpError('Name and phone are required.'); return; }
    setSubmitting(true);
    setRsvpError('');
    try {
      await publicApi.rsvpEvent(event.id, form);
      setSubmitted(true);
    } catch (err) {
      setRsvpError(err.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream pt-32">
        <div className="container-page max-w-4xl mx-auto space-y-6">
          <div className="h-10 w-48 bg-purple-brand/10 rounded animate-pulse" />
          <div className="h-80 bg-white rounded-xl animate-pulse" />
          <div className="h-48 bg-white rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <Calendar size={48} className="text-purple-brand/20 mx-auto mb-4" />
          <h2 className="font-display text-2xl text-ink font-light mb-2">Event not found</h2>
          <p className="text-ink/50 font-body text-sm mb-6">This event may have ended or been removed.</p>
          <Link to="/events" className="btn-primary"><Calendar size={14} /> Browse All Events</Link>
        </div>
      </div>
    );
  }

  const isPast = new Date(event.startDate) < new Date();

  return (
    <>
      {/* Hero */}
      <div className="bg-purple-deep pt-32 pb-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-gradient" />
        {event.imageUrl && (
          <div className="absolute inset-0">
            <img src={event.imageUrl} alt="" className="w-full h-full object-cover opacity-15" />
          </div>
        )}
        <div className="container-page relative z-10 max-w-4xl mx-auto pb-12">
          <Link to="/events" className="inline-flex items-center gap-1 text-white/50 hover:text-white text-xs font-body mb-6 transition-colors">
            <ChevronLeft size={14} /> All Events
          </Link>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className={`text-[11px] font-body font-medium px-2.5 py-1 rounded-full ${CATEGORY_COLORS[event.category] ?? 'bg-white/10 text-white/60'}`}>
              {CATEGORY_LABELS[event.category] ?? event.category}
            </span>
            {event.isFeatured && (
              <span className="text-[11px] font-body font-semibold px-2.5 py-1 rounded-full bg-gold text-white">
                Featured
              </span>
            )}
          </div>
          <h1 className="font-display text-display text-white font-light leading-tight mb-4">
            {event.title}
          </h1>

          <div className="flex flex-wrap gap-4 text-white/60 text-sm font-body">
            <span className="flex items-center gap-1.5">
              <Calendar size={14} /> {fmtDate(event.startDate)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={14} /> {event.timeGmt} GMT
              {event.timeEst && ` · ${event.timeEst} EST`}
              {event.timeBst && ` · ${event.timeBst} BST`}
            </span>
            {event.venue && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} /> {event.venue}
              </span>
            )}
            {event.isOnline && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Wifi size={14} /> Streaming Online
              </span>
            )}
          </div>
        </div>

        {/* Countdown */}
        {!isPast && !countdown.done && countdown.days !== undefined && (
          <div className="border-t border-white/10 bg-white/5 backdrop-blur-sm">
            <div className="container-page max-w-4xl mx-auto py-6">
              <p className="text-white/40 text-[10px] font-body uppercase tracking-widest text-center mb-4">
                Event starts in
              </p>
              <div className="flex items-center justify-center gap-3">
                <CountdownBlock label="Days"    value={countdown.days} />
                <span className="text-white/30 font-display text-2xl mt-[-8px]">:</span>
                <CountdownBlock label="Hours"   value={countdown.hours} />
                <span className="text-white/30 font-display text-2xl mt-[-8px]">:</span>
                <CountdownBlock label="Minutes" value={countdown.minutes} />
                <span className="text-white/30 font-display text-2xl mt-[-8px]">:</span>
                <CountdownBlock label="Seconds" value={countdown.seconds} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <section className="section-pad bg-cream">
        <div className="container-page max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Description */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-purple-brand/8 p-6">
                <h2 className="font-display text-xl text-ink font-light mb-4">About this Event</h2>
                <RichContent
                  html={event.description}
                  className="text-ink/70 font-body text-sm leading-relaxed"
                />
              </div>

              {/* Online join link */}
              {event.isOnline && event.joinLink && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                  <h3 className="font-body font-semibold text-emerald-800 text-sm mb-1">Join Online</h3>
                  <p className="text-emerald-700 text-xs font-body mb-3">
                    This event is streamed online. Click the link below to join.
                  </p>
                  <a
                    href={event.joinLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-body font-semibold px-4 py-2 rounded hover:bg-emerald-700 transition-colors"
                  >
                    <ExternalLink size={13} /> Join Stream
                  </a>
                </div>
              )}

              {isPast && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-800 text-sm font-body">
                  This event has already taken place. Check our{' '}
                  <Link to="/sermons" className="underline hover:text-amber-900">sermons page</Link>{' '}
                  for recordings.
                </div>
              )}
            </div>

            {/* RSVP sidebar */}
            <div>
              {!isPast ? (
                <div className="bg-white rounded-xl border border-purple-brand/8 p-5 sticky top-24">
                  <h3 className="font-display text-lg text-ink font-light mb-4">Reserve Your Spot</h3>
                  {submitted ? (
                    <div className="text-center py-4">
                      <CheckCircle size={36} className="text-gold mx-auto mb-3" />
                      <p className="font-body text-sm text-ink/80">You're registered! We look forward to seeing you.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleRsvp} className="space-y-3">
                      <div>
                        <label className="section-label block mb-1.5">Full Name *</label>
                        <input className="input" value={form.name} onChange={set('name')} placeholder="Your name" />
                      </div>
                      <div>
                        <label className="section-label block mb-1.5">Phone *</label>
                        <input type="tel" className="input" value={form.phone} onChange={set('phone')} placeholder="+233..." />
                      </div>
                      <div>
                        <label className="section-label block mb-1.5">Email (optional)</label>
                        <input type="email" className="input" value={form.email} onChange={set('email')} placeholder="you@example.com" />
                      </div>
                      {event.isOnline && (
                        <div>
                          <label className="section-label block mb-1.5">Attendance</label>
                          <select className="input" value={form.attendance} onChange={set('attendance')}>
                            <option value="in-person">In Person</option>
                            <option value="online">Online</option>
                          </select>
                        </div>
                      )}
                      {rsvpError && <p className="text-red-500 text-xs font-body">{rsvpError}</p>}
                      <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-3 disabled:opacity-50">
                        {submitting ? 'Registering…' : <><CheckCircle size={14} /> RSVP Now</>}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-purple-brand/8 p-5">
                  <h3 className="font-display text-lg text-ink font-light mb-3">Upcoming Events</h3>
                  <p className="text-ink/50 font-body text-sm mb-4">Browse our other upcoming events.</p>
                  <Link to="/events" className="btn-outline w-full justify-center py-2.5 text-sm">
                    <Calendar size={14} /> View All Events
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
