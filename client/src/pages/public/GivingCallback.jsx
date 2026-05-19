import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { publicApi } from '../../services/api';

export default function GivingCallback() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get('reference') || searchParams.get('trxref');

  const [status, setStatus] = useState('loading'); // loading | success | failed | error

  useEffect(() => {
    if (!reference) { setStatus('error'); return; }
    publicApi.verifyGiving(reference)
      .then((res) => setStatus(res.data.status === 'COMPLETED' ? 'success' : 'failed'))
      .catch(() => setStatus('error'));
  }, [reference]);

  const states = {
    loading: {
      icon: <Loader2 size={52} className="text-gold animate-spin mx-auto" />,
      title: 'Verifying your gift…',
      body:  'Please wait while we confirm your transaction.',
    },
    success: {
      icon: <CheckCircle size={52} className="text-green-500 mx-auto" />,
      title: 'Thank you for your generosity!',
      body:  'Your gift has been received and confirmed. It is an act of worship and a seed for the Kingdom.',
    },
    failed: {
      icon: <XCircle size={52} className="text-red-400 mx-auto" />,
      title: 'Payment not completed',
      body:  'Your transaction was not completed. No amount has been charged. Please try again.',
    },
    error: {
      icon: <XCircle size={52} className="text-red-400 mx-auto" />,
      title: 'Something went wrong',
      body:  'We could not verify your transaction. If you were charged, please contact us and we will resolve it promptly.',
    },
  };

  const { icon, title, body } = states[status];

  return (
    <>
      <SEO title="Payment Result" noIndex />
      <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-20">
        <div className="bg-white rounded-2xl shadow-lg border border-purple-brand/10 max-w-md w-full p-10 text-center">
          <div className="mb-5">{icon}</div>
          <h1 className="font-display text-2xl text-ink mb-3">{title}</h1>
          <p className="font-body text-ink/60 text-sm leading-relaxed mb-2">{body}</p>
          {reference && status !== 'loading' && (
            <p className="text-xs text-ink/30 font-body mb-8">Ref: {reference}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            {status === 'failed' || status === 'error' ? (
              <Link to="/give" className="btn-primary">Try Again</Link>
            ) : (
              <Link to="/give" className="btn-primary">Give Again</Link>
            )}
            <Link to="/" className="btn-outline">Back to Home</Link>
          </div>
        </div>
      </div>
    </>
  );
}
