import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LOGO_URL } from '../../config/brand';

// Supabase throttles reset emails for the whole project ("email rate limit
// exceeded") and per visitor. Returns a friendly retry message for those, or
// null when the error is something else.
function rateLimitMessage(err) {
  if (err?.status !== 429 && !/rate limit/i.test(err?.message || '')) return null;
  return 'Too many links have been requested just now. Please wait a few minutes and try again.';
}

// Supabase's per-address limit ("For security purposes, you can only request
// this after 42 seconds") only kicks in for addresses that have an account, so
// showing it would reveal who is a partner.
function isPerAddressLimit(err) {
  return /only request this after/i.test(err?.message || '');
}

export default function PartnerForgotPassword() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
        redirectTo: `${window.location.origin}/partner/set-password`,
      });
      // A link already went to that address in the last minute, so the
      // confirmation below is still true.
      if (resetErr && !isPerAddressLimit(resetErr)) throw resetErr;
      // Same message whether or not the address has an account, so this page
      // can't be used to find out who is a partner.
      setSent(true);
    } catch (err) {
      setError(rateLimitMessage(err) || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-purple-deep flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="HPC Global" className="h-16 w-auto mx-auto mb-3 object-contain" />
          <h1 className="font-display text-white text-2xl font-light">Forgot Your Password?</h1>
          <p className="text-white/40 font-body text-sm mt-1">Enter your email and we'll send you a link to set a new one</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
                <CheckCircle size={26} className="text-green-400" />
              </div>
              <p className="text-white/70 font-body text-sm">
                If a partner account uses that email, we've sent a link to set a new password. Check your inbox and spam folder.
              </p>
              <Link to="/partner/login" className="text-gold hover:text-gold-light text-sm font-body inline-block">← Back to login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm font-body">{error}</div>
              )}
              <div>
                <label className="text-white/50 text-xs font-body uppercase tracking-widest block mb-2">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full bg-white/10 border border-white/15 rounded px-4 py-3 text-white text-sm font-body placeholder-white/30 focus:outline-none focus:border-gold"
                  placeholder="your@email.com"
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full bg-gold text-purple-deep font-body font-semibold py-3 rounded text-sm hover:bg-gold-light transition-colors disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <p className="text-center text-white/35 text-xs font-body pt-1">
                Remembered it?{' '}
                <Link to="/partner/login" className="text-gold hover:text-gold-light transition-colors">Back to login</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
