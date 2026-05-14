import { useState } from 'react';
import { MapPin, Phone, Mail, Clock, Video, CheckCircle } from 'lucide-react';
import { FaYoutube, FaFacebook, FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { publicApi } from '../../services/api';
import SectionHero from '../../components/ui/SectionHero';

const schema = z.object({
  name:    z.string().min(1, 'Name is required'),
  email:   z.string().email('Valid email required'),
  phone:   z.string().optional(),
  type:    z.string().min(1, 'Select an enquiry type'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

const ENQUIRY_TYPES = ['General', 'Pastoral', 'Event', 'Media / Press', 'Partnership', 'Other'];

const SERVICES = [
  { name: 'Dominion Encounter',       time: 'Sundays 9:00 AM – 11:30 AM GMT' },
  { name: 'Prophetic & Miracle',      time: 'Fridays 6:30 PM – 9:00 PM GMT'  },
  { name: 'Global Prophetic Highway', time: 'Sundays 9pm GMT · 4pm EST · 10pm BST' },
];

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { type: '' },
  });

  async function onSubmit(data) {
    setSubmitting(true);
    try {
      await publicApi.submitContact(data);
      setSubmitted(true);
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
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
                      <p className="text-ink/60 font-body text-sm">Klagon Junction, Behind K. Ofori Enterprise, Accra, Ghana</p>
                      <a
                        href="https://maps.google.com/?q=5.6656744,-0.0471646"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold font-body text-xs hover:text-gold-light transition-colors mt-1 inline-block"
                      >
                        Get directions →
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <FaWhatsapp size={18} className="text-gold flex-shrink-0" />
                    <div>
                      <p className="font-body font-semibold text-ink text-sm">WhatsApp (Primary)</p>
                      <a href="https://wa.me/233000000000" target="_blank" rel="noopener noreferrer"
                        className="text-ink/60 font-body text-sm hover:text-gold transition-colors">
                        +233 000 000 000
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Phone size={18} className="text-gold flex-shrink-0" />
                    <div>
                      <p className="font-body font-semibold text-ink text-sm">Phone</p>
                      <p className="text-ink/60 font-body text-sm">+233 000 000 000</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Mail size={18} className="text-gold flex-shrink-0" />
                    <div>
                      <p className="font-body font-semibold text-ink text-sm">Email</p>
                      <a href="mailto:info@hpcglobal.org" className="text-ink/60 font-body text-sm hover:text-gold transition-colors">
                        info@hpcglobal.org
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Map embed */}
              <div className="rounded-xl overflow-hidden border border-purple-brand/10 h-56">
                <iframe
                  src="https://maps.google.com/maps?q=5.6656744,-0.0471646&z=16&output=embed"
                  width="100%"
                  height="100%"
                  title="HPC Global — Klagon Junction, Accra"
                  loading="lazy"
                  className="border-0"
                />
              </div>

              {/* Social links */}
              <div>
                <p className="section-label mb-4">Follow Us</p>
                <div className="flex items-center gap-3">
                  <a href="https://youtube.com/@prophetclottey" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm font-body text-ink/60 hover:text-red-600 transition-colors">
                    <FaYoutube size={18} className="text-red-600" /> YouTube
                  </a>
                  <a href="#" className="flex items-center gap-2 text-sm font-body text-ink/60 hover:text-blue-600 transition-colors">
                    <FaFacebook size={18} className="text-blue-600" /> Facebook
                  </a>
                  <a href="#" className="flex items-center gap-2 text-sm font-body text-ink/60 hover:text-pink-500 transition-colors">
                    <FaInstagram size={18} className="text-pink-500" /> Instagram
                  </a>
                </div>
              </div>

              {/* Service times summary */}
              <div>
                <p className="section-label mb-4">Service Times</p>
                <div className="space-y-3">
                  {SERVICES.map((s) => (
                    <div key={s.name} className="flex items-start gap-2">
                      <Clock size={13} className="text-gold mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-body font-semibold text-ink text-sm">{s.name}: </span>
                        <span className="text-ink/60 font-body text-sm">{s.time}</span>
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
                  <p className="text-xs text-ink/40 font-body">We aim to respond within 24 hours.</p>
                  <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-4">
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
