import { useState, useCallback } from 'react';
import { MapPin, Phone, Mail, Clock, CheckCircle } from 'lucide-react';
import { FaYoutube, FaFacebook, FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import SectionHero from '../../components/ui/SectionHero';
import SEO from '../../components/ui/SEO';

const schema = z.object({
  name:    z.string().min(1, 'Name is required'),
  email:   z.string().email('Valid email required'),
  phone:   z.string().optional(),
  type:    z.string().min(1, 'Select an enquiry type'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

const ENQUIRY_TYPES = ['General', 'Pastoral', 'Event', 'Media / Press', 'Partnership', 'Other'];

export default function Contact() {
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const fetchFn = useCallback(() => publicApi.getSettings(), []);
  const { data: settings } = useApi(fetchFn);

  const fetchTimes = useCallback(() => publicApi.getServiceTimes(), []);
  const { data: rawTimes } = useApi(fetchTimes);
  const serviceTimes = Array.isArray(rawTimes) && rawTimes.length > 0 ? rawTimes : [
    { id: 's1', name: 'Dominion Encounter',       timeGmt: 'Sundays 9:00 AM – 11:30 AM GMT' },
    { id: 's2', name: 'Prophetic & Miracle',      timeGmt: 'Fridays 6:30 PM – 9:00 PM GMT' },
    { id: 's3', name: 'Global Prophetic Highway', timeGmt: 'Sundays 9pm GMT · 4pm EST · 10pm BST' },
  ];

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { type: '' },
  });

  async function onSubmit(data) {
    setSubmitting(true);
    setSubmitError('');
    try {
      await publicApi.submitContact(data);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const phone   = settings?.phone   || null;
  const email   = settings?.email   || null;
  const address = settings?.address || 'Klagon Junction, Behind K. Ofori Enterprise, Accra, Ghana';
  const waNum   = settings?.whatsapp || null;
  const waUrl   = waNum ? `https://wa.me/${waNum.replace(/\D/g, '')}` : null;

  const ytHandle = settings?.youtubeHandle || '@prophetclottey';
  const ytUrl    = `https://youtube.com/${ytHandle.startsWith('@') ? ytHandle : '@' + ytHandle}`;
  const fbUrl    = settings?.facebookUrl  || null;
  const igUrl    = settings?.instagramUrl || null;

  const mapsLat = settings?.mapsLat || 5.6656744;
  const mapsLng = settings?.mapsLng || -0.0471646;
  const mapsQ   = `${mapsLat},${mapsLng}`;

  return (
    <>
      <SEO
        title="Contact Us"
        description="Get in touch with HPC Global. We respond within 24 hours. Find us in Accra, Ghana or join us online."
      />
      <SectionHero
        title="Contact Us"
        subtitle="We would love to hear from you. Our team responds within 24 hours."
        breadcrumb="Home / Contact"
      />

      <section className="section-pad bg-cream">
        <div className="container-page">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14">

            {/* Left — details */}
            <div className="space-y-8">
              <div>
                <p className="section-label mb-4">Find Us</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <MapPin size={18} className="text-gold mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-body font-semibold text-ink text-sm">Physical Address</p>
                      <p className="text-ink/60 font-body text-sm">{address}</p>
                      <a
                        href={`https://maps.google.com/?q=${mapsQ}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold font-body text-xs hover:text-gold-light transition-colors mt-1 inline-block"
                      >
                        Get directions →
                      </a>
                    </div>
                  </div>

                  {waUrl && (
                    <div className="flex items-center gap-3">
                      <FaWhatsapp size={18} className="text-gold flex-shrink-0" />
                      <div>
                        <p className="font-body font-semibold text-ink text-sm">WhatsApp</p>
                        <a href={waUrl} target="_blank" rel="noopener noreferrer"
                          className="text-ink/60 font-body text-sm hover:text-gold transition-colors">
                          {waNum}
                        </a>
                      </div>
                    </div>
                  )}

                  {phone && (
                    <div className="flex items-center gap-3">
                      <Phone size={18} className="text-gold flex-shrink-0" />
                      <div>
                        <p className="font-body font-semibold text-ink text-sm">Phone</p>
                        <a href={`tel:${phone}`} className="text-ink/60 font-body text-sm hover:text-gold transition-colors">
                          {phone}
                        </a>
                      </div>
                    </div>
                  )}

                  {email && (
                    <div className="flex items-center gap-3">
                      <Mail size={18} className="text-gold flex-shrink-0" />
                      <div>
                        <p className="font-body font-semibold text-ink text-sm">Email</p>
                        <a href={`mailto:${email}`} className="text-ink/60 font-body text-sm hover:text-gold transition-colors">
                          {email}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Map embed */}
              <div className="rounded-xl overflow-hidden border border-purple-brand/10 h-56">
                <iframe
                  src={`https://maps.google.com/maps?q=${mapsQ}&z=16&output=embed`}
                  width="100%"
                  height="100%"
                  title="HPC Global location"
                  loading="lazy"
                  className="border-0"
                />
              </div>

              {/* Social links */}
              <div>
                <p className="section-label mb-4">Follow Us</p>
                <div className="flex items-center gap-4 flex-wrap">
                  <a href={ytUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm font-body text-ink/60 hover:text-red-600 transition-colors">
                    <FaYoutube size={18} className="text-red-600" /> YouTube
                  </a>
                  {fbUrl && (
                    <a href={fbUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-body text-ink/60 hover:text-blue-600 transition-colors">
                      <FaFacebook size={18} className="text-blue-600" /> Facebook
                    </a>
                  )}
                  {igUrl && (
                    <a href={igUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-body text-ink/60 hover:text-pink-500 transition-colors">
                      <FaInstagram size={18} className="text-pink-500" /> Instagram
                    </a>
                  )}
                  {waUrl && (
                    <a href={waUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-body text-ink/60 hover:text-green-600 transition-colors">
                      <FaWhatsapp size={18} className="text-green-600" /> WhatsApp
                    </a>
                  )}
                </div>
              </div>

              {/* Service times */}
              <div>
                <p className="section-label mb-4">Service Times</p>
                <div className="space-y-3">
                  {serviceTimes.map((s) => (
                    <div key={s.id} className="flex items-start gap-2">
                      <Clock size={13} className="text-gold mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-body font-semibold text-ink text-sm">{s.name}: </span>
                        <span className="text-ink/60 font-body text-sm">
                          {[s.timeGmt, s.timeEst, s.timeBst].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right — form */}
            <div>
              <p className="section-label mb-4">Send us a message</p>

              {submitted ? (
                <div className="bg-white rounded-xl p-10 text-center border border-purple-brand/10">
                  <CheckCircle size={48} className="text-gold mx-auto mb-4" />
                  <h3 className="font-display text-2xl text-ink mb-2">Message received!</h3>
                  <p className="text-ink/60 font-body">We will get back to you within 24 hours. God bless you.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl p-8 border border-purple-brand/10 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="section-label block mb-2">Name *</label>
                      <input type="text" className="input" {...register('name')} placeholder="Your name" />
                      {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                    </div>
                    <div>
                      <label className="section-label block mb-2">Email *</label>
                      <input type="email" className="input" {...register('email')} placeholder="you@example.com" />
                      {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                    </div>
                    <div>
                      <label className="section-label block mb-2">Phone (optional)</label>
                      <input type="tel" className="input" {...register('phone')} placeholder="+233..." />
                    </div>
                    <div>
                      <label className="section-label block mb-2">Enquiry Type *</label>
                      <select className="input" {...register('type')}>
                        <option value="">Select…</option>
                        {ENQUIRY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {errors.type && <p className="text-red-500 text-xs mt-1">{errors.type.message}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="section-label block mb-2">Message *</label>
                    <textarea rows={5} className="input resize-none" {...register('message')} placeholder="How can we help?" />
                    {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message.message}</p>}
                  </div>
                  {submitError && (
                    <p className="text-red-500 text-xs font-body bg-red-50 border border-red-200 rounded px-3 py-2">{submitError}</p>
                  )}
                  <p className="text-xs text-ink/40 font-body">We aim to respond within 24 hours.</p>
                  <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-4 disabled:opacity-50">
                    {submitting ? 'Sending…' : 'Send Message'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
