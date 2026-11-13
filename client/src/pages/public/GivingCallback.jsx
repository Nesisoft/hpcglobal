import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, RefreshCcw, Heart, ArrowLeft, Handshake, Clock } from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { publicApi } from '../../services/api';
import { amountLabel, monthLabel } from '../../utils/tithe';

const CATEGORY_LABELS = {
  TITHE:         'tithe',
  OFFERING:      'offering',
  FIRST_FRUITS:  'first fruits',
  BUILDING_FUND: 'building fund',
  MISSIONS:      'missions',
  PASTORAL:      'pastoral support',
  OTHER:         'gift',
};

// Mobile money is often confirmed a little after the giver is sent back here,
// so a waiting payment is checked again on its own a few times.
const AUTO_CHECKS   = 6;
const AUTO_CHECK_MS = 5000;

const TEMPORARY_PROBLEM = "We couldn't confirm your payment just now. Please try again in a moment.";

/** What the giver is told about their tithe and the register. */
function titheMessage(tithe, amountStr) {
  const gift  = `Your tithe${amountStr ? ` of ${amountStr}` : ''}${tithe.month ? ` for ${monthLabel(tithe.month)}` : ''}`;
  const month = tithe.month ? ` for ${monthLabel(tithe.month)}` : '';
  if (tithe.recorded && tithe.number) {
    return `${gift} has been received and recorded against tithe number ${tithe.number}. We celebrate you.`;
  }
  if (tithe.number) {
    return `${gift} has been received. We couldn't match tithe number ${tithe.number} automatically, so the church office will add it to the register${month} — there's no need to pay again.`;
  }
  return `${gift} has been received. The church office will add it to the tithe register${month}.`;
}

export default function GivingCallback() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get('reference') || searchParams.get('trxref');

  // loading | success | waiting | review | failed | retry | error
  const [status, setStatus]     = useState('loading');
  const [details, setDetails]   = useState(null);    // { status, stage, source, category, amount, currency, tithe }
  const [problem, setProblem]   = useState('');
  const [checking, setChecking] = useState(false);
  const autoChecks = useRef(0);

  const check = useCallback(async () => {
    if (!reference) { setStatus('error'); return; }
    setChecking(true);
    try {
      const { data } = await publicApi.verifyGiving(reference);
      setDetails(data);
      if (data.status === 'COMPLETED') setStatus('success');
      // Paystack says it was paid, but the figures don't match the gift: a
      // person has to look. Waiting longer won't change it, and paying again
      // would be wrong.
      else if (data.status === 'PENDING' && data.stage === 'mismatch') setStatus('review');
      // Abandoned means the giver left the payment page — nothing is coming.
      else if (data.status === 'PENDING' && data.stage !== 'abandoned') setStatus('waiting');
      else setStatus('failed');
    } catch (err) {
      // An unknown reference is a dead end; anything else (the server or
      // Paystack briefly unreachable) is worth another try, not a new payment.
      if (err.response?.status === 404) setStatus('error');
      else {
        setProblem(err.response?.data?.message || TEMPORARY_PROBLEM);
        setStatus('retry');
      }
    } finally {
      setChecking(false);
    }
  }, [reference]);

  useEffect(() => { check(); }, [check]);

  useEffect(() => {
    if (status !== 'waiting' || checking || autoChecks.current >= AUTO_CHECKS) return undefined;
    const timer = setTimeout(() => { autoChecks.current += 1; check(); }, AUTO_CHECK_MS);
    return () => clearTimeout(timer);
  }, [status, checking, check]);

  const isPartner = details?.source === 'PARTNER';
  const amountStr = details?.amount != null ? amountLabel(details.amount, details.currency || 'GHS') : null;

  let successBody;
  if (isPartner) {
    successBody = `Thank you for honouring your partnership commitment${amountStr ? ` of ${amountStr}` : ''}. Your faithful support is a seed sown into the ministry — God bless you. We celebrate you.`;
  } else if (details?.tithe) {
    successBody = titheMessage(details.tithe, amountStr);
  } else {
    successBody = `Your ${CATEGORY_LABELS[details?.category] ?? 'gift'}${amountStr ? ` of ${amountStr}` : ''} has been received and confirmed. It is an act of worship and a seed for the Kingdom. We celebrate you.`;
  }

  const states = {
    loading: {
      icon: <Loader2 size={52} className="text-gold animate-spin mx-auto" />,
      title: 'Verifying your payment…',
      body:  'Please wait while we confirm your transaction.',
    },
    success: {
      icon:  isPartner ? <Handshake size={52} className="text-green-500 mx-auto" /> : <CheckCircle size={52} className="text-green-500 mx-auto" />,
      title: isPartner ? 'Partnership payment received!' : 'Thank you for your generosity!',
      body:  successBody,
    },
    waiting: {
      icon:  <Clock size={52} className="text-gold mx-auto" />,
      title: 'Almost there',
      body:  'Waiting for confirmation from your mobile money provider… If a prompt came up on your phone, approve it, then tap Check again. There\'s no need to pay again.',
    },
    failed: {
      icon: <XCircle size={52} className="text-red-400 mx-auto" />,
      title: 'Payment not completed',
      body:  'Your transaction was not completed. No amount has been charged. Please try again.',
    },
    review: {
      icon:  <Clock size={52} className="text-gold mx-auto" />,
      title: 'We\'re checking this payment',
      body:  'Your payment provider reported a payment we need to check by hand before we can confirm it. There\'s no need to pay again. If you don\'t hear from the church office within a few days, contact us with the reference below.',
    },
    retry: {
      icon: <Clock size={52} className="text-gold mx-auto" />,
      title: 'We couldn\'t confirm it yet',
      body:  `${problem} If money has left your account, there's no need to pay again.`,
    },
    error: {
      icon: <XCircle size={52} className="text-red-400 mx-auto" />,
      title: 'Something went wrong',
      body:  'We could not verify your transaction. If you were charged, please contact us and we will resolve it promptly.',
    },
  };

  const { icon, title, body } = states[status];
  const canCheckAgain = status === 'waiting' || status === 'retry';

  return (
    <>
      <SEO title="Payment Result" noIndex />
      <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-20">
        <div className="bg-white rounded-2xl shadow-lg border border-purple-brand/10 max-w-md w-full p-6 sm:p-10 text-center">
          <div className="mb-5">{icon}</div>
          <h1 className="font-display text-2xl text-ink mb-3">{title}</h1>
          <p className="font-body text-ink/60 text-sm leading-relaxed mb-2">{body}</p>
          {reference && status !== 'loading' && (
            <p className="text-xs text-ink/30 font-body mb-8 break-all">Ref: {reference}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            {canCheckAgain ? (
              <button type="button" onClick={check} disabled={checking} className="btn-primary justify-center disabled:opacity-60">
                {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                {checking ? 'Checking…' : 'Check again'}
              </button>
            ) : status === 'failed' || status === 'error' ? (
              <Link to={isPartner ? '/partner/portal' : '/give'} className="btn-primary justify-center"><RefreshCcw size={14} /> Try Again</Link>
            ) : status === 'review' ? null : isPartner ? (
              <Link to="/partner/portal" className="btn-primary justify-center"><Handshake size={14} /> Back to Portal</Link>
            ) : (
              <Link to="/give" className="btn-primary justify-center"><Heart size={14} /> Give Again</Link>
            )}
            <Link to="/" className="btn-outline justify-center"><ArrowLeft size={14} /> Back to Home</Link>
          </div>
        </div>
      </div>
    </>
  );
}
