import { useState, useEffect, useMemo } from 'react';
import SEO from '../../components/ui/SEO';
import { Heart, Smartphone, Building2, CreditCard, CheckCircle, Home, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { publicApi } from '../../services/api';
import SectionHero from '../../components/ui/SectionHero';
import { canonicalPhone, normalizeTitheNumber, monthLabel, thisMonth, addMonths } from '../../utils/tithe';

const QUICK_AMOUNTS = [20, 50, 100, 200, 500];
const MAX_AMOUNT = 10_000_000;   // the server refuses more

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

const OPTIONAL_NAME_CATEGORIES = ['TITHE', 'OFFERING'];

// The fields a server error can be pinned to; anything else goes in the box
// above the button.
const FORM_FIELDS = ['amount', 'category', 'method', 'email', 'name', 'phone', 'titheMonth', 'titheNumber'];
// Where each field lives on the page, in the order they appear.
const FIELD_IDS = {
  amount: 'give-amount', category: 'give-category', titheMonth: 'give-tithe-month', phone: 'give-phone',
  titheNumber: 'give-tithe-number', method: 'give-method', email: 'give-email', name: 'give-name',
};

// Same wording as the server, so the giver reads one message whichever side
// catches it.
const PHONE_MISSING = 'Please enter your phone number.';
const PHONE_BAD     = "That phone number doesn't look right. Enter it like 024 412 3456, or with the country code (+233…).";
const MONTH_MISSING = 'Please choose the month this tithe is for.';

/** Why a typed tithe number can't be used. Only called when it doesn't normalise. */
function titheNumberProblem(typed) {
  if (typed.replace(/\D/g, '').length >= 9) return 'That looks like a phone number — put it in the phone box.';
  return `"${typed}" isn't a tithe number. Tithe numbers look like HPC021 — or leave it blank.`;
}

// Whole pesewas only: 150.5 and 150.50 are fine, 150.505 is not.
const hasPesewasOnly = (v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

const ghs = (amount) => `GH₵ ${Number(amount).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const schema = z.object({
  name:        z.string().max(120, 'Please keep the name under 120 characters.').optional(),
  email:       z.string().email('Valid email required'),
  amount:      z.number({ error: 'Enter an amount' })
    .positive('Must be positive')
    .max(MAX_AMOUNT, 'For a gift this large, please contact the church office.')
    .refine(hasPesewasOnly, 'Use at most two decimal places, e.g. 150.50'),
  category:    z.string().min(1, 'Select a category'),
  method:      z.string().min(1, 'Select a payment method'),
  phone:       z.string().optional(),
  titheMonth:  z.string().optional(),
  titheNumber: z.string().optional(),
}).superRefine((d, ctx) => {
  if (!OPTIONAL_NAME_CATEGORIES.includes(d.category) && !d.name?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Name is required', path: ['name'] });
  }
  if (d.category !== 'TITHE') return;
  const phone = String(d.phone ?? '').trim();
  if (!phone) ctx.addIssue({ code: 'custom', message: PHONE_MISSING, path: ['phone'] });
  else if (!canonicalPhone(phone)) ctx.addIssue({ code: 'custom', message: PHONE_BAD, path: ['phone'] });
  if (!/^\d{4}-\d{2}$/.test(String(d.titheMonth ?? ''))) {
    ctx.addIssue({ code: 'custom', message: MONTH_MISSING, path: ['titheMonth'] });
  }
  const number = String(d.titheNumber ?? '').trim();
  if (number && !normalizeTitheNumber(number)) {
    ctx.addIssue({ code: 'custom', message: titheNumberProblem(number), path: ['titheNumber'] });
  }
// Run even while the amount is still empty, so every problem shows at once
// rather than one round at a time.
}, { when: () => true });

export default function Give() {
  const [customAmount, setCustomAmount] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [bankDetails, setBankDetails] = useState(null);
  const [wasTithe, setWasTithe] = useState(false);
  const [formError, setFormError] = useState('');

  const { register, handleSubmit, watch, setValue, setError, trigger, formState: { errors, touchedFields, isSubmitted } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { category: 'TITHE', method: 'MTN_MOMO', titheMonth: thisMonth(), titheNumber: '', phone: '' },
    // onInvalid takes the giver to the first problem in page order; the
    // library's own focus would skip the amount buttons (no input there).
    shouldFocusError: false,
  });

  const selectedCategory = watch('category');
  const selectedMethod   = watch('method');
  const amount           = watch('amount');
  const titheMonth       = watch('titheMonth');
  const typedNumber      = String(watch('titheNumber') ?? '').trim();
  const categoryDesc     = CATEGORIES.find((c) => c.value === selectedCategory)?.desc;
  const nameOptional     = OPTIONAL_NAME_CATEGORIES.includes(selectedCategory);
  const isTithe          = selectedCategory === 'TITHE';

  // Two months ahead down to a year back, newest first. The server accepts a
  // month either side of this, so a page left open overnight still works.
  const monthChoices = useMemo(() => {
    const current = thisMonth();
    return Array.from({ length: 15 }, (_, i) => {
      const value = addMonths(current, 2 - i);
      return { value, label: value === current ? `${monthLabel(value)} (this month)` : monthLabel(value) };
    });
  }, []);

  // What the office will see, said back to the giver while they type.
  const normalizedNumber = normalizeTitheNumber(typedNumber);
  let numberNote = null;
  if (errors.titheNumber) {
    numberNote = <p className="text-red-500 text-xs mt-1 font-body">{errors.titheNumber.message}</p>;
  } else if (typedNumber && !normalizedNumber && (touchedFields.titheNumber || isSubmitted)) {
    numberNote = <p className="text-red-500 text-xs mt-1 font-body">{titheNumberProblem(typedNumber)}</p>;
  } else if (normalizedNumber && normalizedNumber !== typedNumber) {
    numberNote = <p className="text-green-700 text-xs mt-1 font-body">We&rsquo;ll record it as <strong>{normalizedNumber}</strong></p>;
  }

  const amountOk = Number.isFinite(amount) && amount > 0;
  const summary  = isTithe
    ? [`Tithe for ${monthLabel(titheMonth)}`, normalizedNumber, amountOk && ghs(amount)].filter(Boolean).join(' · ')
    : '';

  // Re-validate name whenever category changes (required-ness may have changed)
  useEffect(() => { trigger('name'); }, [selectedCategory, trigger]);

  // Back from Paystack: phones restore this page from the back/forward cache
  // exactly as it was left — with the button still on "Processing…".
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) setSubmitting(false); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  // On a phone the first problem may be far above the button; take the giver
  // to it rather than leave "Give Now" seeming to do nothing.
  function onInvalid(errs) {
    const first = Object.keys(FIELD_IDS).find((field) => errs[field]);
    if (!first) return;
    const el = document.getElementById(FIELD_IDS[first]);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
  }

  function pickAmount(amt) {
    setCustomAmount(false);
    setSelectedAmount(amt);
    setValue('amount', amt, { shouldValidate: !!errors.amount });
  }

  async function onSubmit(data) {
    setSubmitting(true);
    setFormError('');
    const { phone, titheMonth: month, titheNumber, name, ...rest } = data;
    const payload = { ...rest, amount: Math.round(data.amount * 100) / 100 };
    if (name?.trim()) payload.name = name.trim();
    // The tithe details only mean something for a tithe; other gifts don't send them.
    if (data.category === 'TITHE') {
      payload.phone = phone.trim();
      payload.titheMonth = month;
      if (titheNumber?.trim()) payload.titheNumber = titheNumber.trim();
    }
    try {
      const res = await publicApi.initiateGiving(payload);
      setWasTithe(data.category === 'TITHE');
      if (res.data.url) {
        // Leave the button on "Processing…" while the browser moves to Paystack.
        window.location.href = res.data.url;
        return;
      }
      if (res.data.bankDetails) setBankDetails(res.data.bankDetails);
      setSuccess(res.data.reference);
    } catch (err) {
      const body = err.response?.data;
      if (body?.field && FORM_FIELDS.includes(body.field) && body.message) {
        setError(body.field, { type: 'server', message: body.message }, { shouldFocus: true });
      } else if (!err.response) {
        setFormError("We couldn't reach the church's server. Check your connection and try again.");
      } else {
        setFormError(body?.message || 'Something went wrong. Please try again.');
      }
    }
    setSubmitting(false);
  }

  if (success && bankDetails) {
    return (
      <>
        <SectionHero title="Give to HPC Global" breadcrumb="Home / Give" />
        <section className="section-pad bg-cream">
          <div className="container-page max-w-lg mx-auto text-center">
            <div className="bg-white rounded-xl p-6 sm:p-10 border border-purple-brand/10">
              <CheckCircle size={48} className="text-gold mx-auto mb-4" />
              <h2 className="font-display text-2xl text-ink mb-3">Bank Transfer Details</h2>
              <p className="text-ink/60 font-body text-sm mb-6">Please transfer your gift to the account below and use your reference number.</p>
              <div className="bg-cream rounded-lg p-5 text-left space-y-2 text-sm font-body mb-6 break-words">
                <p><span className="text-ink/50">Bank:</span> <strong>{bankDetails.bankName}</strong></p>
                <p><span className="text-ink/50">Account:</span> <strong>{bankDetails.bankAccount}</strong></p>
                <p><span className="text-ink/50">Branch:</span> <strong>{bankDetails.bankBranch}</strong></p>
                {bankDetails.bankSwift && <p><span className="text-ink/50">SWIFT Code:</span> <strong>{bankDetails.bankSwift}</strong></p>}
                {bankDetails.bankCode && <p><span className="text-ink/50">Bank Code:</span> <strong>{bankDetails.bankCode}</strong></p>}
                <p className="pt-2 border-t border-purple-brand/10"><span className="text-ink/50">Reference:</span> <strong className="text-gold">{success}</strong></p>
              </div>
              {wasTithe && (
                <p className="text-ink/60 font-body text-sm mb-6 text-left">
                  Bank transfers are added to the tithe register by the church office when they arrive. In the transfer reference, put your tithe number if you have one — otherwise the reference above.
                </p>
              )}
              <a href="/" className="btn-primary"><Home size={14} /> Back to Home</a>
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
            <div className="bg-white rounded-xl p-6 sm:p-10 border border-purple-brand/10">
              <CheckCircle size={48} className="text-gold mx-auto mb-4" />
              <h2 className="font-display text-2xl text-ink mb-3">Thank you for your generosity!</h2>
              <p className="text-ink/60 font-body mb-2">Your gift is an act of worship and a seed for the Kingdom.</p>
              <p className="text-xs text-ink/40 font-body mb-6 break-all">Reference: {success}</p>
              <a href="/" className="btn-primary"><Home size={14} /> Back to Home</a>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <SEO title="Give" description="Support the mission of HPC Global. Give online via mobile money, bank transfer, or Paystack. Every seed sown advances the Kingdom." />
      <SectionHero title="Give to HPC Global" subtitle="Your generosity fuels the mission." breadcrumb="Home / Give" />

      {/* Intro */}
      <section className="section-pad bg-cream">
        <div className="container-page max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

            {/* Left — form */}
            <div>
              <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="space-y-6">
                {/* Amount */}
                <div id="give-amount" tabIndex={-1} className="focus:outline-none">
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
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="Enter amount"
                      className="input"
                      {...register('amount', { valueAsNumber: true })}
                    />
                  )}
                  {errors.amount && <p className="text-red-500 text-xs mt-1 font-body">{errors.amount.message}</p>}
                </div>

                {/* Category */}
                <div>
                  <label htmlFor="give-category" className="section-label block mb-3">Giving Category</label>
                  <select id="give-category" className="input" {...register('category')}>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  {categoryDesc && (
                    <p className="text-ink/50 text-xs font-body mt-1.5">{categoryDesc}</p>
                  )}
                </div>

                {/* Your tithe — what the office needs to put it on the register */}
                {isTithe && (
                  <div className="bg-white rounded-xl border border-gold/30 p-4 sm:p-5 space-y-4">
                    <p className="section-label">Your tithe</p>

                    <div>
                      <label htmlFor="give-tithe-month" className="font-body text-sm font-medium text-ink block mb-1.5">Month this tithe is for *</label>
                      <select id="give-tithe-month" className="input" {...register('titheMonth')}>
                        {monthChoices.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                      {errors.titheMonth && <p className="text-red-500 text-xs mt-1 font-body">{errors.titheMonth.message}</p>}
                    </div>

                    <div>
                      <label htmlFor="give-phone" className="font-body text-sm font-medium text-ink block mb-1.5">Phone number *</label>
                      <input
                        id="give-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="024 412 3456"
                        className="input"
                        {...register('phone')}
                      />
                      {errors.phone
                        ? <p className="text-red-500 text-xs mt-1 font-body">{errors.phone.message}</p>
                        : <p className="text-ink/50 text-xs font-body mt-1.5">We use it to match your tithe if your tithe number can&rsquo;t be found.</p>}
                    </div>

                    <div>
                      <label htmlFor="give-tithe-number" className="font-body text-sm font-medium text-ink block mb-1.5">Tithe number (optional)</label>
                      <input
                        id="give-tithe-number"
                        type="text"
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="e.g. HPC021"
                        className="input"
                        {...register('titheNumber')}
                      />
                      {numberNote}
                      <p className="text-ink/50 text-xs font-body mt-1.5">
                        It&rsquo;s on your tithe card. No number, or not sure? Leave it blank — the church office will add your tithe to the register.
                      </p>
                    </div>
                  </div>
                )}

                {/* Payment method */}
                <div id="give-method" tabIndex={-1} className="focus:outline-none">
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
                <div className="space-y-4">
                  <div>
                    <label htmlFor="give-email" className="section-label block mb-2">Email *</label>
                    <input id="give-email" type="email" autoComplete="email" className="input" placeholder="your@email.com" {...register('email')} />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="give-name" className="section-label block mb-2">
                      Full Name{nameOptional ? ' (optional)' : ' *'}
                    </label>
                    <input id="give-name" type="text" autoComplete="name" className="input" placeholder="Your name" {...register('name')} />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                    {isTithe && !errors.name && (
                      <p className="text-ink/50 text-xs font-body mt-1.5">Helps the office find you if you don&rsquo;t have a tithe number.</p>
                    )}
                  </div>
                </div>

                {summary && (
                  <p className="font-body text-sm text-ink/70 bg-gold-pale border border-gold/20 rounded-lg px-4 py-3">{summary}</p>
                )}

                {formError && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-body text-red-700">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-4 text-base disabled:opacity-60">
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
