import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarCheck, Clock, CheckCircle, Send, Home as HomeIcon } from 'lucide-react';
import SEO from '../../components/ui/SEO';
import SectionHero from '../../components/ui/SectionHero';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';

const schema = z.object({
  name:   z.string().min(1, 'Name is required'),
  email:  z.string().email('Valid email required'),
  phone:  z.string().min(9, 'Valid phone required'),
  reason: z.string().min(1, 'Please select a reason'),
  notes:  z.string().optional(),
});

export default function BookAppointment() {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState('');
  const [done, setDone]                 = useState(false);

  const fetchFn = useCallback(() => publicApi.getAppointmentSlots(), []);
  const { data, loading, refetch } = useApi(fetchFn);
  const days    = data?.days ?? [];
  const reasons = data?.reasons ?? [];

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const activeDay = days.find((d) => d.date === selectedDate) ?? null;

  function pickDate(date) {
    setSelectedDate(date);
    setSelectedTime(null);
  }

  async function onSubmit(values) {
    if (!selectedDate || !selectedTime) {
      setSubmitError('Please choose a day and time.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await publicApi.bookAppointment({ ...values, date: selectedDate, time: selectedTime });
      setDone(true);
    } catch (err) {
      setSubmitError(err.response?.data?.message ?? 'Something went wrong. Please try again.');
      if (err.response?.status === 409) {
        refetch();
        setSelectedTime(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <SectionHero title="Book an Appointment" breadcrumb="Home / Appointments" />
        <section className="section-pad bg-cream">
          <div className="container-page max-w-lg mx-auto text-center">
            <div className="bg-white rounded-xl p-10 border border-purple-brand/10">
              <CheckCircle size={48} className="text-gold mx-auto mb-4" />
              <h2 className="font-display text-2xl text-ink mb-3">Appointment Requested</h2>
              <p className="text-ink/60 font-body mb-6">
                Thank you. Your appointment request has been received and is pending confirmation. We will contact you by email and SMS once it is confirmed.
              </p>
              <Link to="/" className="btn-primary"><HomeIcon size={14} /> Back to Home</Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <SEO title="Book an Appointment" description="Book a personal appointment with the Prophet. Choose an available day and time that works for you." />
      <SectionHero
        title="Book an Appointment"
        subtitle="Schedule a personal appointment with the Prophet."
        breadcrumb="Home / Appointments"
      />

      <section className="section-pad bg-cream">
        <div className="container-page max-w-4xl mx-auto">
          {loading ? (
            <div className="bg-white rounded-xl h-72 animate-pulse border border-purple-brand/10" />
          ) : days.length === 0 ? (
            <div className="bg-white rounded-xl p-10 text-center border border-purple-brand/10">
              <CalendarCheck size={40} className="text-purple-brand/30 mx-auto mb-4" />
              <h3 className="font-display text-2xl text-ink font-light mb-2">No slots available</h3>
              <p className="text-ink/50 font-body text-sm">
                There are no appointment times open at the moment. Please check back soon or <Link to="/contact" className="text-gold">contact us</Link>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              {/* Day + time picker */}
              <div className="space-y-6">
                <div>
                  <label className="section-label block mb-3 flex items-center gap-2">
                    <CalendarCheck size={14} className="text-gold" /> Choose a Day
                  </label>
                  <div className="flex flex-col gap-2">
                    {days.map((d) => (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => pickDate(d.date)}
                        className={`px-4 py-3 rounded-lg text-sm font-body text-left border transition-colors ${
                          selectedDate === d.date
                            ? 'bg-purple-brand/8 border-purple-brand text-purple-brand font-medium'
                            : 'bg-white border-purple-brand/15 text-ink/70 hover:border-purple-brand/30'
                        }`}
                      >
                        {d.label}
                        <span className="text-ink/40 text-xs ml-2">{d.slots.length} slot{d.slots.length !== 1 ? 's' : ''}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {activeDay && (
                  <div>
                    <label className="section-label block mb-3 flex items-center gap-2">
                      <Clock size={14} className="text-gold" /> Choose a Time (GMT)
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {activeDay.slots.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSelectedTime(t)}
                          className={`px-3 py-2 rounded-lg text-sm font-body border transition-colors ${
                            selectedTime === t
                              ? 'bg-gold text-purple-deep border-gold font-medium'
                              : 'bg-white border-purple-brand/15 text-ink/70 hover:border-gold/40'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="bg-white rounded-xl p-6 border border-purple-brand/10 space-y-4">
                <h3 className="font-display text-lg text-ink font-light">Your Details</h3>
                {selectedDate && selectedTime && (
                  <p className="text-sm font-body text-purple-brand bg-purple-brand/5 rounded-lg px-3 py-2">
                    {activeDay?.label} · {selectedTime} GMT
                  </p>
                )}
                <div>
                  <label className="section-label block mb-2">Full Name *</label>
                  <input type="text" className="input" placeholder="Your name" {...register('name')} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="section-label block mb-2">Email *</label>
                  <input type="email" className="input" placeholder="you@example.com" {...register('email')} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="section-label block mb-2">Phone *</label>
                  <input type="tel" className="input" placeholder="+233..." {...register('phone')} />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                </div>
                <div>
                  <label className="section-label block mb-2">Reason *</label>
                  <select className="input" {...register('reason')}>
                    <option value="">Select a reason…</option>
                    {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                    <option value="Other">Other</option>
                  </select>
                  {errors.reason && <p className="text-red-500 text-xs mt-1">{errors.reason.message}</p>}
                </div>
                <div>
                  <label className="section-label block mb-2">Additional Notes (optional)</label>
                  <textarea rows={3} className="input resize-none" placeholder="Anything we should know…" {...register('notes')} />
                </div>
                {submitError && (
                  <p className="text-red-500 text-xs font-body bg-red-50 border border-red-200 rounded px-3 py-2">{submitError}</p>
                )}
                <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-3.5 disabled:opacity-50">
                  {submitting ? 'Booking…' : <><Send size={14} /> Request Appointment</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
