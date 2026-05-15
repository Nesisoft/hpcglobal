import { useState, useCallback } from 'react';
import { Heart, Lock, Phone, CheckCircle } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import SectionHero from '../../components/ui/SectionHero';
import SEO from '../../components/ui/SEO';

const schema = z.object({
  name:      z.string().optional(),
  phone:     z.string().optional(),
  email:     z.string().email('Valid email required').optional().or(z.literal('')),
  category:  z.enum(['HEALTH','FAMILY','FINANCE','CAREER','SPIRITUAL','RELATIONSHIPS','OTHER']),
  request:   z.string().min(10, 'Please share at least a few words about your request').max(1000, 'Please keep it under 1000 characters'),
  wantsCall: z.boolean().default(false),
  isPrivate: z.boolean().default(true),
});

const CATEGORIES = [
  { value: 'HEALTH',        label: 'Health & Healing' },
  { value: 'FAMILY',        label: 'Family' },
  { value: 'FINANCE',       label: 'Finance' },
  { value: 'CAREER',        label: 'Career & Work' },
  { value: 'SPIRITUAL',     label: 'Spiritual Growth' },
  { value: 'RELATIONSHIPS', label: 'Relationships' },
  { value: 'OTHER',         label: 'Other' },
];

export default function Prayer() {
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchFn = useCallback(() => publicApi.getSettings(), []);
  const { data: settings } = useApi(fetchFn);
  const waNum = settings?.whatsapp || null;
  const waUrl = waNum ? `https://wa.me/${waNum.replace(/\D/g, '')}` : 'https://wa.me/233000000000';

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { category: 'SPIRITUAL', isPrivate: true, wantsCall: false },
  });

  const request = watch('request') ?? '';

  async function onSubmit(data) {
    setSubmitting(true);
    try {
      await publicApi.submitPrayer(data);
      setSubmitted(true);
    } catch (err) {
      alert(err.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SEO
        title="Prayer Request"
        description="Submit a prayer request to HPC Global. Our pastoral team prays over every request in confidence."
      />
      <SectionHero
        title="Prayer Request"
        subtitle="Bring your burden to the throne of grace. Our pastoral team prays over every request."
        breadcrumb="Home / Prayer"
      />

      {/* Promise */}
      <section className="section-pad bg-cream">
        <div className="container-page max-w-3xl mx-auto text-center">
          <p className="section-label mb-3">Our promise to you</p>
          <h2 className="section-heading mb-6">We Pray Over Every Request</h2>
          <p className="text-ink/60 font-body text-base leading-relaxed">
            Every request that comes to us is taken seriously and lifted before the Lord by our
            pastoral team. We hold every detail in confidence. You are not forgotten — God hears,
            and so do we.
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="section-pad bg-white" id="form">
        <div className="container-page max-w-2xl mx-auto">
          {submitted ? (
            <div className="bg-cream rounded-xl p-10 text-center border border-purple-brand/10">
              <CheckCircle size={48} className="text-gold mx-auto mb-4" />
              <h3 className="font-display text-2xl text-ink mb-2">Your request has been received</h3>
              <p className="text-ink/60 font-body">
                Our pastoral team will be praying for you. May the Lord meet you at your point of need.
              </p>
              <button
                onClick={() => { setSubmitted(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="btn-outline mt-6 inline-flex"
              >
                Submit another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="bg-cream rounded-xl p-8 border border-purple-brand/10 space-y-5">
              <div className="text-center mb-2">
                <Heart size={24} className="text-gold mx-auto mb-3" />
                <p className="section-label">Share your heart</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="section-label block mb-2">Your Name (optional)</label>
                  <input type="text" className="input" placeholder="Anonymous is okay" {...register('name')} />
                </div>
                <div>
                  <label className="section-label block mb-2">Phone (optional)</label>
                  <input type="tel" className="input" placeholder="+233..." {...register('phone')} />
                </div>
                <div className="sm:col-span-2">
                  <label className="section-label block mb-2">Email (optional)</label>
                  <input type="email" className="input" placeholder="you@example.com" {...register('email')} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
              </div>

              <div>
                <label className="section-label block mb-2">Category *</label>
                <select className="input" {...register('category')}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="section-label block mb-2">Your Request *</label>
                <textarea
                  rows={6}
                  className="input resize-none"
                  placeholder="Share what's on your heart… (minimum 10 characters)"
                  {...register('request')}
                />
                <div className="flex items-center justify-between mt-1">
                  {errors.request
                    ? <p className="text-red-500 text-xs">{errors.request.message}</p>
                    : <span />}
                  <p className="text-ink/35 text-[11px] font-body">{request.length}/1000</p>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-purple-brand/10">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-1 accent-purple-brand" {...register('isPrivate')} />
                  <span className="flex-1">
                    <span className="flex items-center gap-1.5 text-ink font-body text-sm font-medium">
                      <Lock size={12} /> Keep this private
                    </span>
                    <span className="text-ink/50 text-xs font-body block">
                      Only our pastoral team will see your request. It will never be shared publicly.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-1 accent-purple-brand" {...register('wantsCall')} />
                  <span className="flex-1">
                    <span className="flex items-center gap-1.5 text-ink font-body text-sm font-medium">
                      <Phone size={12} /> I'd like a pastor to call me
                    </span>
                    <span className="text-ink/50 text-xs font-body block">
                      A pastoral team member will reach out personally (please include your phone).
                    </span>
                  </span>
                </label>
              </div>

              <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-4">
                {submitting ? 'Sending…' : 'Submit Prayer Request'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Alternative contacts */}
      <section className="section-pad bg-purple-deep">
        <div className="container-page max-w-3xl mx-auto text-center">
          <p className="section-label text-gold mb-4">Need to speak with someone now?</p>
          <h2 className="section-heading-light mb-6">We're One Message Away</h2>
          <p className="text-white/60 font-body mb-8">
            If your need is urgent, reach out to our prayer line directly on WhatsApp.
          </p>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded font-body font-semibold text-sm hover:bg-green-600 transition-colors"
          >
            <FaWhatsapp size={18} /> Prayer Line on WhatsApp
          </a>
        </div>
      </section>
    </>
  );
}
