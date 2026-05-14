import { useState } from 'react';
import { Heart, Smartphone, Building2, CreditCard, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { publicApi } from '../../services/api';
import SectionHero from '../../components/ui/SectionHero';

const QUICK_AMOUNTS = [20, 50, 100, 200, 500];

const CATEGORIES = [
  { value: 'TITHE',         label: 'Tithes',          desc: 'The first tenth of your income, returned to God as worship.' },
  { value: 'OFFERING',      label: 'Offering',         desc: 'A freewill gift to support the work of the ministry.' },
  { value: 'FIRST_FRUITS',  label: 'First Fruits',     desc: 'Honouring God with the first and best of what He has given you.' },
  { value: 'BUILDING_FUND', label: 'Building Fund',    desc: 'Contributing to the expansion of our physical home.' },
  { value: 'MISSIONS',      label: 'Missions',         desc: 'Supporting the spread of the Gospel to unreached communities.' },
  { value: 'PASTORAL',      label: 'Pastoral Support', desc: 'Blessing and honouring the ministry of our pastors.' },
  { value: 'OTHER',         label: 'Other',            desc: 'Any other specific gift or pledge.' },
];

const METHODS = [
  { value: 'MTN_MOMO',      label: 'MTN MoMo',       Icon: Smartphone },
  { value: 'TELECEL',       label: 'Telecel Cash',    Icon: Smartphone },
  { value: 'AIRTELTIGO',    label: 'AirtelTigo',      Icon: Smartphone },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer',   Icon: Building2  },
  { value: 'CARD',          label: 'Card',            Icon: CreditCard },
];

const schema = z.object({
  name:     z.string().min(1, 'Name is required'),
  phone:    z.string().min(9, 'Valid phone required'),
  email:    z.string().email('Valid email required').optional().or(z.literal('')),
  amount:   z.number({ invalid_type_error: 'Enter an amount' }).positive('Must be positive'),
  category: z.string().min(1, 'Select a category'),
  method:   z.string().min(1, 'Select a payment method'),
});

export default function Give() {
  const [customAmount, setCustomAmount] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [bankDetails, setBankDetails] = useState(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { category: 'TITHE', method: 'MTN_MOMO' },
  });

  const selectedCategory = watch('category');
  const selectedMethod   = watch('method');
  const categoryDesc = CATEGORIES.find((c) => c.value === selectedCategory)?.desc;

  function pickAmount(amt) {
    setCustomAmount(false);
    setSelectedAmount(amt);
    setValue('amount', amt);
  }

  async function onSubmit(data) {
    setSubmitting(true);
    try {
      const res = await publicApi.initiateGiving(data);
      if (res.data.url) {
        window.location.href = res.data.url;
      } else if (res.data.bankDetails) {
        setBankDetails(res.data.bankDetails);
        setSuccess(res.data.reference);
      } else {
        setSuccess(res.data.reference);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success && bankDetails) {
    return (
      <>
        <SectionHero title="Give to HPC Global" breadcrumb="Home / Give" />
        <section className="section-pad bg-cream">
          <div className="container-page max-w-lg mx-auto text-center">
            <div className="bg-white rounded-xl p-10 border border-purple-brand/10">
              <CheckCircle size={48} className="text-gold mx-auto mb-4" />
              <h2 className="font-display text-2xl text-ink mb-3">Bank Transfer Details</h2>
              <p className="text-ink/60 font-body text-sm mb-6">Please transfer your gift to the account below and use your reference number.</p>
              <div className="bg-cream rounded-lg p-5 text-left space-y-2 text-sm font-body mb-6">
                <p><span className="text-ink/50">Bank:</span> <strong>{bankDetails.bankName}</strong></p>
                <p><span className="text-ink/50">Account:</span> <strong>{bankDetails.bankAccount}</strong></p>
                <p><span className="text-ink/50">Branch:</span> <strong>{bankDetails.bankBranch}</strong></p>
                <p className="pt-2 border-t border-purple-brand/10"><span className="text-ink/50">Reference:</span> <strong className="text-gold">{success}</strong></p>
              </div>
              <a href="/" className="btn-primary">Back to Home</a>
            </div>
          </div>
        </section>
      </>
    );
  }

  if (success) {
    return (
      <>
        <SectionHero title="Give to HPC Global" breadcrumb="Home / Give" />
        <section className="section-pad bg-cream">
          <div className="container-page max-w-lg mx-auto text-center">
            <div className="bg-white rounded-xl p-10 border border-purple-brand/10">
              <CheckCircle size={48} className="text-gold mx-auto mb-4" />
              <h2 className="font-display text-2xl text-ink mb-3">Thank you for your generosity!</h2>
              <p className="text-ink/60 font-body mb-2">Your gift is an act of worship and a seed for the Kingdom.</p>
              <p className="text-xs text-ink/40 font-body mb-6">Reference: {success}</p>
              <a href="/" className="btn-primary">Back to Home</a>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <SectionHero title="Give to HPC Global" subtitle="Your generosity fuels the mission." breadcrumb="Home / Give" />

      {/* Intro */}
      <section className="section-pad bg-cream">
        <div className="container-page max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

            {/* Left — form */}
            <div>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Amount */}
                <div>
                  <label className="section-label block mb-3">Amount (GHS)</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {QUICK_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => pickAmount(amt)}
                        className={`px-4 py-2 rounded text-sm font-body font-medium border transition-colors ${
                          selectedAmount === amt && !customAmount
                            ? 'bg-gold text-purple-deep border-gold'
                            : 'bg-white border-purple-brand/15 text-ink/60 hover:border-gold/50'
                        }`}
                      >
                        GH₵ {amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setCustomAmount(true); setSelectedAmount(null); setValue('amount', undefined); }}
                      className={`px-4 py-2 rounded text-sm font-body font-medium border transition-colors ${
                        customAmount ? 'bg-gold text-purple-deep border-gold' : 'bg-white border-purple-brand/15 text-ink/60 hover:border-gold/50'
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  {customAmount && (
                    <input
                      type="number"
                      placeholder="Enter amount"
                      className="input"
                      {...register('amount', { valueAsNumber: true })}
                    />
                  )}
                  {errors.amount && <p className="text-red-500 text-xs mt-1 font-body">{errors.amount.message}</p>}
                </div>

                {/* Category */}
                <div>
                  <label className="section-label block mb-3">Giving Category</label>
                  <select className="input" {...register('category')}>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  {categoryDesc && (
                    <p className="text-ink/50 text-xs font-body mt-1.5">{categoryDesc}</p>
                  )}
                </div>

                {/* Payment method */}
                <div>
                  <label className="section-label block mb-3">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {METHODS.map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setValue('method', value)}
                        className={`flex items-center gap-2 px-4 py-3 rounded border text-sm font-body font-medium transition-colors ${
                          selectedMethod === value
                            ? 'bg-gold/10 border-gold text-ink'
                            : 'bg-white border-purple-brand/15 text-ink/60 hover:border-gold/40'
                        }`}
                      >
                        <Icon size={14} className={selectedMethod === value ? 'text-gold' : 'text-ink/40'} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Personal details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="section-label block mb-2">Full Name *</label>
                    <input type="text" className="input" placeholder="Your name" {...register('name')} />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label className="section-label block mb-2">Phone Number *</label>
                    <input type="tel" className="input" placeholder="+233..." {...register('phone')} />
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="section-label block mb-2">Email (optional)</label>
                    <input type="email" className="input" placeholder="For receipt" {...register('email')} />
                  </div>
                </div>

                <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-4 text-base">
                  {submitting ? 'Processing…' : <><Heart size={16} /> Give Now</>}
                </button>
              </form>
            </div>

            {/* Right — why give */}
            <div className="space-y-6">
              <div className="bg-purple-deep rounded-xl p-8 text-center">
                <Heart size={32} className="text-gold mx-auto mb-4" />
                <p className="font-display text-white text-xl italic font-light leading-relaxed mb-3">
                  "Bring the whole tithe into the storehouse… and see if I will not throw open the floodgates of heaven."
                </p>
                <p className="text-white/40 font-body text-sm">— Malachi 3:10</p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-purple-brand/10">
                <h3 className="font-display text-h3 text-ink mb-4">Your gift supports:</h3>
                <ul className="space-y-3">
                  {[
                    'Weekly Sunday and Friday services',
                    'The Global Prophetic Highway online ministry',
                    'Youth and children\'s programmes',
                    'Community outreach and evangelism',
                    'Building and infrastructure projects',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm font-body text-ink/70">
                      <div className="w-1.5 h-1.5 rounded-full bg-gold mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gold-pale rounded-xl p-6 border border-gold/20">
                <p className="text-xs font-body font-semibold uppercase tracking-widest text-ink/50 mb-2">Secure giving</p>
                <p className="text-sm font-body text-ink/70">All online payments are processed securely via Paystack. Your financial information is never stored on our servers.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
