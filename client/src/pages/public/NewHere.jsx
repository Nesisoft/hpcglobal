import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Video, Church, Users, Home as HomeIcon, CheckCircle, Clock, Send } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import SectionHero from '../../components/ui/SectionHero';
import SEO from '../../components/ui/SEO';

const schema = z.object({
  name:         z.string().min(1, 'Name is required'),
  phone:        z.string().min(9, 'Phone number is required'),
  email:        z.string().email().optional().or(z.literal('')),
  country:      z.string().optional(),
  city:         z.string().optional(),
  source:       z.string().optional(),
  message:      z.string().optional(),
  preferredSvc: z.string().optional(),
});

const SOURCES = ['YouTube', 'Facebook', 'Instagram', 'Friend', 'Google', 'Other'];
const SERVICES = ['Dominion Encounter (Sunday)', 'Prophetic & Miracle (Friday)', 'Global Prophetic Highway (Online)'];

export default function NewHere() {
  const [submitted, setSubmitted]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');

  const fetchFn = useCallback(() => publicApi.getSettings(), []);
  const { data: settings } = useApi(fetchFn);

  const waNum = settings?.whatsapp || null;
  const waUrl = waNum ? `https://wa.me/${waNum.replace(/\D/g, '')}` : 'https://wa.me/233000000000';

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  // Preferred services support multiple selections, stored as a comma-joined string.
  const preferredSvc = watch('preferredSvc') || '';
  const selectedServices = preferredSvc ? preferredSvc.split(', ').filter(Boolean) : [];
  const toggleService = (svc) => {
    const next = selectedServices.includes(svc)
      ? selectedServices.filter((s) => s !== svc)
      : [...selectedServices, svc];
    setValue('preferredSvc', next.join(', '));
  };

  async function onSubmit(data) {
    setSubmitting(true);
    setSubmitError('');
    try {
      await publicApi.submitVisitor(data);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SEO
        title="New Here?"
        description="Visiting HPC Global for the first time? We've been expecting you. Find out what to expect and fill in your connect card."
      />
      <SectionHero
        title="New Here?"
        subtitle="We've been expecting you. Let us help you feel right at home."
        breadcrumb="Home / New Here?"
      />

      {/* Welcome message */}
      <section className="section-pad bg-cream">
        <div className="container-page max-w-4xl mx-auto text-center">
          <p className="section-label mb-4">A personal welcome</p>
          <div className="bg-white rounded-xl p-10 border border-purple-brand/10 mb-8">
            <Video size={40} className="text-gold mx-auto mb-5" />
            <h2 className="font-display text-2xl text-ink mb-4">
              Welcome to the HPC Global Family
            </h2>
            <p className="font-display italic text-purple-brand text-xl font-light leading-relaxed mb-4">
              "We are so glad you found us. This is not an accident — God has a plan and a purpose for your life, and we believe you have come to the right place. Come as you are. You are accepted, you are loved, and you are welcome."
            </p>
            <p className="text-ink/50 font-body text-sm">
              — Prophet George Clottey & Lady Apostle Adelaide Clottey
            </p>
          </div>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded font-body font-semibold text-sm hover:bg-green-600 transition-colors"
          >
            <FaWhatsapp size={18} /> Chat with us on WhatsApp
          </a>
        </div>
      </section>

      {/* What to expect */}
      <section className="section-pad bg-white">
        <div className="container-page">
          <div className="text-center mb-10">
            <p className="section-label mb-3">Be prepared</p>
            <h2 className="section-heading">What to Expect</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div>
              <h3 className="font-display text-h3 text-ink mb-5 flex items-center gap-2">
                <Church size={20} className="text-gold" /> In Person
              </h3>
              <ul className="space-y-4">
                {[
                  { label: 'Arrival', text: 'Our welcome team greets you at the door and helps you feel at home from the moment you walk in.' },
                  { label: 'Worship', text: 'Spirit-led, expectant worship that creates an atmosphere for the presence of God.' },
                  { label: 'The Word', text: 'Prophetic, practical, and transformative preaching directly from the Word of God.' },
                  { label: 'Ministry time', text: 'Opportunity for prayer, altar call, and prophetic ministry at the close of service.' },
                  { label: 'Dress code', text: 'Smart casual — come as you are. We care more about your heart than your outfit.' },
                  { label: 'Duration', text: 'Approximately 2.5 hours. Stay for fellowship after!' },
                ].map(({ label, text }) => (
                  <li key={label} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold mt-2 flex-shrink-0" />
                    <div>
                      <span className="font-body font-semibold text-ink text-sm">{label}: </span>
                      <span className="text-ink/60 font-body text-sm">{text}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-display text-h3 text-ink mb-5 flex items-center gap-2">
                <Video size={20} className="text-gold" /> Online
              </h3>
              <ul className="space-y-4">
                {[
                  { label: 'YouTube live', text: 'Watch our Sunday and Friday services live at youtube.com/@prophetclottey.' },
                  { label: 'Prophetic Highway', text: 'Join the Zoom service on Sunday evenings — global prayer and the Word. Contact us for the link.' },
                  { label: 'Chat', text: 'Participate in the YouTube live chat. Our team monitors and responds during the service.' },
                  { label: 'Prayer online', text: 'Type your prayer request in the chat or send it via WhatsApp and our prayer team will pray.' },
                  { label: 'Give online', text: 'You can sow from anywhere in the world via our online giving page.' },
                  { label: 'Connect', text: 'Fill in the connect card below — our team will reach out personally after the service.' },
                ].map(({ label, text }) => (
                  <li key={label} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold mt-2 flex-shrink-0" />
                    <div>
                      <span className="font-body font-semibold text-ink text-sm">{label}: </span>
                      <span className="text-ink/60 font-body text-sm">{text}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Connect form */}
      <section className="section-pad bg-cream" id="connect">
        <div className="container-page max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <p className="section-label mb-3">Let's connect</p>
            <h2 className="section-heading">Fill in Your Connect Card</h2>
            <p className="text-ink/60 font-body text-sm mt-2">Our welcome team will reach out within 48 hours.</p>
          </div>

          {submitted ? (
            <div className="bg-white rounded-xl p-10 text-center border border-purple-brand/10">
              <CheckCircle size={48} className="text-gold mx-auto mb-4" />
              <h3 className="font-display text-2xl text-ink mb-2">Welcome to the family!</h3>
              <p className="text-ink/60 font-body">Our welcome team will be in touch shortly. In the meantime, check out our services.</p>
              <Link to="/services" className="btn-primary mt-6 inline-flex"><Clock size={14} /> View Services</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl p-8 border border-purple-brand/10 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="section-label block mb-2">Full Name *</label>
                  <input type="text" className="input" placeholder="Your full name" {...register('name')} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="section-label block mb-2">Phone *</label>
                  <input type="tel" className="input" placeholder="+233..." {...register('phone')} />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                </div>
                <div>
                  <label className="section-label block mb-2">Email (optional)</label>
                  <input type="email" className="input" placeholder="you@example.com" {...register('email')} />
                </div>
                <div>
                  <label className="section-label block mb-2">Country</label>
                  <input type="text" className="input" placeholder="e.g. Ghana, UK" {...register('country')} />
                </div>
                <div>
                  <label className="section-label block mb-2">City</label>
                  <input type="text" className="input" placeholder="e.g. Accra, London" {...register('city')} />
                </div>
                <div>
                  <label className="section-label block mb-2">How did you find us?</label>
                  <select className="input" {...register('source')}>
                    <option value="">Select…</option>
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="section-label block mb-2">Preferred Service(s)</label>
                <input type="hidden" {...register('preferredSvc')} />
                <div className="flex flex-wrap gap-2">
                  {SERVICES.map((s) => {
                    const active = selectedServices.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleService(s)}
                        className={`px-4 py-2 rounded-full text-xs font-body font-medium border transition-colors ${
                          active
                            ? 'bg-gold/10 border-gold text-ink'
                            : 'bg-white border-purple-brand/15 text-ink/60 hover:border-gold/40'
                        }`}
                      >
                        {active && <CheckCircle size={12} className="inline mr-1.5 -mt-0.5 text-gold" />}
                        {s}
                      </button>
                    );
                  })}
                </div>
                <p className="text-ink/40 text-xs font-body mt-1.5">Select all that apply.</p>
              </div>
              <div>
                <label className="section-label block mb-2">What are you hoping to find? (optional)</label>
                <textarea rows={3} className="input resize-none" placeholder="Feel free to share…" {...register('message')} />
              </div>
              {submitError && (
                <p className="text-red-500 text-xs font-body bg-red-50 border border-red-200 rounded px-3 py-2">{submitError}</p>
              )}
              <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-4 disabled:opacity-50">
                {submitting ? 'Sending…' : <><Send size={14} /> Submit Connect Card</>}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Next steps */}
      <section className="section-pad bg-purple-deep">
        <div className="container-page text-center">
          <p className="section-label text-gold mb-4">Your journey starts here</p>
          <h2 className="section-heading-light mb-10">Next Steps</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { step: '01', Icon: Church, label: 'Visit a Service', desc: 'Join us in person or online. Experience the presence of God with the HPC Global family.' },
              { step: '02', Icon: Users, label: 'Join a Ministry', desc: 'Find your place of service and community within one of our ministry arms.' },
              { step: '03', Icon: HomeIcon, label: 'Get Planted', desc: 'Connect to a cell group and put down roots. This is your home.' },
            ].map(({ step, Icon, label, desc }) => (
              <div key={step} className="text-center">
                <div className="w-16 h-16 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center mx-auto mb-4">
                  <Icon size={24} className="text-gold" />
                </div>
                <div className="text-gold/40 font-display text-3xl font-light mb-1">{step}</div>
                <h3 className="font-display text-white text-xl font-light mb-2">{label}</h3>
                <p className="text-white/50 font-body text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
