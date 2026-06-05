import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Heart, Video, BookOpen, Users, CheckCircle, ArrowRight } from 'lucide-react';
import SEO from '../../components/ui/SEO';
import SectionHero from '../../components/ui/SectionHero';
import { partnerHttp } from '../../services/api';

const BENEFITS = [
  { icon: Video,    title: 'One-on-One Zoom Sessions', desc: 'Exclusive access to scheduled Zoom meetings with the prophet for personal guidance.' },
  { icon: BookOpen, title: 'Spiritual Instructions',   desc: 'Receive prophetic direction, spiritual assignments, and messages sent directly to your portal.' },
  { icon: Heart,    title: 'Ministry Impact',          desc: 'Your commitment fuels the spread of the Gospel, missions, and ministry operations worldwide.' },
  { icon: Users,    title: 'Partner Community',        desc: 'Join a global family of believers committed to advancing the Kingdom together.' },
];

const schema = z.object({
  firstName:  z.string().min(1, 'First name required'),
  lastName:   z.string().min(1, 'Last name required'),
  email:      z.string().email('Valid email required'),
  phone:      z.string().optional(),
  country:    z.string().optional(),
  city:       z.string().optional(),
  motivation: z.string().optional(),
  agreed:     z.boolean().refine((v) => v, 'You must agree before continuing'),
});

export default function Partner() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data) {
    const { agreed, ...payload } = data;
    setSubmitting(true);
    setServerError('');
    try {
      await partnerHttp.post('/partner/apply', payload);
      setDone(true);
    } catch (err) {
      setServerError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SEO title="Partner With Us — HPC Global" description="Partner with Prophet Clottey and HPC Global. Gain access to exclusive Zoom meetings, spiritual guidance, and become part of a global ministry family." />
      <SectionHero title="Partner With Us" subtitle="Become a financial partner and walk in covenant with the ministry." />

      {/* Benefits */}
      <section className="section-pad bg-white">
        <div className="container-page">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Why Partner?</p>
            <h2 className="section-heading">Walk in Covenant with the Prophet</h2>
            <p className="text-ink/60 font-body mt-4 max-w-2xl mx-auto">
              Partnering is more than a financial commitment — it is a spiritual covenant. As a partner, you are co-labouring with the prophet to advance the Kingdom of God.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center p-6 rounded-2xl border border-purple-brand/10 bg-cream/30">
                <div className="w-12 h-12 rounded-full bg-purple-brand/10 flex items-center justify-center mx-auto mb-4">
                  <Icon size={20} className="text-purple-brand" />
                </div>
                <h3 className="font-display text-lg text-ink font-light mb-2">{title}</h3>
                <p className="text-ink/60 font-body text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Application form */}
      <section className="section-pad bg-[#F4F2F9]" id="apply">
        <div className="container-page max-w-2xl">
          <div className="text-center mb-10">
            <p className="section-label mb-3">Apply Now</p>
            <h2 className="section-heading">Begin Your Partnership Journey</h2>
            <p className="text-ink/55 font-body mt-3 text-sm">
              Complete the form below. Your account will be created after verification and login credentials sent to your email.
            </p>
          </div>

          {done ? (
            <div className="bg-white rounded-2xl border border-purple-brand/10 p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-5">
                <CheckCircle size={28} className="text-green-500" />
              </div>
              <h3 className="font-display text-2xl text-ink font-light mb-3">Application Submitted!</h3>
              <p className="text-ink/60 font-body mb-6 leading-relaxed">
                Thank you for your commitment. We will review your application and send your login credentials to your email once verified.
              </p>
              <Link to="/partner/login" className="btn-primary inline-flex gap-2">
                Partner Login <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl border border-purple-brand/10 p-8 space-y-5">
              {serverError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body">{serverError}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-ink/70 text-xs font-body font-medium uppercase tracking-wide block mb-1.5">First Name <span className="text-red-400">*</span></label>
                  <input className="input" {...register('firstName')} />
                  {errors.firstName && <p className="text-red-500 text-xs font-body mt-1">{errors.firstName.message}</p>}
                </div>
                <div>
                  <label className="text-ink/70 text-xs font-body font-medium uppercase tracking-wide block mb-1.5">Last Name <span className="text-red-400">*</span></label>
                  <input className="input" {...register('lastName')} />
                  {errors.lastName && <p className="text-red-500 text-xs font-body mt-1">{errors.lastName.message}</p>}
                </div>
              </div>

              <div>
                <label className="text-ink/70 text-xs font-body font-medium uppercase tracking-wide block mb-1.5">Email Address <span className="text-red-400">*</span></label>
                <input type="email" className="input" {...register('email')} />
                {errors.email && <p className="text-red-500 text-xs font-body mt-1">{errors.email.message}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-ink/70 text-xs font-body font-medium uppercase tracking-wide block mb-1.5">Phone Number</label>
                  <input className="input" placeholder="+233..." {...register('phone')} />
                </div>
                <div>
                  <label className="text-ink/70 text-xs font-body font-medium uppercase tracking-wide block mb-1.5">Country</label>
                  <input className="input" placeholder="e.g. Ghana, USA..." {...register('country')} />
                </div>
              </div>

              <div>
                <label className="text-ink/70 text-xs font-body font-medium uppercase tracking-wide block mb-1.5">City</label>
                <input className="input" {...register('city')} />
              </div>

              <div>
                <label className="text-ink/70 text-xs font-body font-medium uppercase tracking-wide block mb-1.5">Why do you want to partner with the ministry? <span className="text-ink/35 text-xs">(optional)</span></label>
                <textarea className="input min-h-[80px] resize-y" {...register('motivation')} />
              </div>

              <div className="rounded-xl bg-purple-brand/5 border border-purple-brand/15 p-4 text-xs font-body text-ink/60 leading-relaxed">
                You'll choose your giving commitment and frequency (weekly, bi-weekly, or monthly) from your partner dashboard once your account is activated.
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-purple-brand"
                  {...register('agreed')}
                />
                <span className="text-sm font-body text-ink/70 leading-relaxed">
                  I understand my partner account will be created after verification, and I agree to the <span className="text-purple-brand underline cursor-pointer">terms of partnership</span>.
                </span>
              </label>
              {errors.agreed && <p className="text-red-500 text-xs font-body -mt-3">{errors.agreed.message}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : <><Heart size={16} /> Submit Partnership Application</>}
              </button>

              <p className="text-center text-xs text-ink/40 font-body">
                Already a partner?{' '}
                <Link to="/partner/login" className="text-purple-brand hover:underline">Log in to your portal</Link>
              </p>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
