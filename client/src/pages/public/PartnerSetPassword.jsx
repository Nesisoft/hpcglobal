import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, CheckCircle } from 'lucide-react';
import { supabase, authLink } from '../../lib/supabase';
import { LOGO_URL } from '../../config/brand';

// A recovery link resets an existing password; anything else (an invite, or a
// visit with no link) is first-time activation. A link Supabase refused doesn't
// say which kind it was, so it gets wording that fits both.
const COPY = {
  activate: {
    heading:  'Create Your Password',
    subtitle: 'Set a password to activate your partner account',
    link:     'activation link',
    button:   'Activate Account',
  },
  reset: {
    heading:  'Reset Your Password',
    subtitle: 'Choose a new password for your partner account',
    link:     'reset link',
    button:   'Save New Password',
  },
  refused: {
    heading:  'Set Your Password',
    subtitle: 'Get a new link to choose a password for your partner account',
    link:     'link',
    button:   'Save Password',
  },
};

// Supabase's error codes for an email link it refused, in plain words.
function linkErrorMessage(code) {
  if (code === 'otp_expired') {
    return 'This link has expired or has already been used. Each link only works once, for a limited time.';
  }
  return 'This link could not be used. It may be incomplete or out of date.';
}

export default function PartnerSetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  // Passed on by PartnerAuthLinkRedirect, or read here when Supabase sent the
  // partner straight to this page.
  const linkError = location.state?.linkError || authLink.error;
  const copy      = linkError ? COPY.refused : authLink.type === 'recovery' ? COPY.reset : COPY.activate;

  const [ready, setReady]       = useState(false);   // invite session detected
  const [checking, setChecking] = useState(!linkError);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [done, setDone]         = useState(false);

  // Supabase parses the invite/recovery token from the URL hash on load and
  // establishes a temporary session. Wait for it before showing the form.
  // A link Supabase already refused will never produce one, so don't wait.
  useEffect(() => {
    if (linkError) return;
    let settled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { settled = true; setReady(true); setChecking(false); }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) {
        settled = true;
        setReady(true);
        setChecking(false);
      }
    });

    // Give the URL-hash exchange a moment; if no session shows up, surface an error.
    const t = setTimeout(() => { if (!settled) setChecking(false); }, 3500);

    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    setError('');
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      // Sign out the temporary invite session so they log in cleanly.
      await supabase.auth.signOut();
      setDone(true);
      setTimeout(() => navigate('/partner/login'), 2500);
    } catch (err) {
      setError(err.message || 'Could not set your password. The link may have expired.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-purple-deep flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="HPC Global" className="h-16 w-auto mx-auto mb-3 object-contain" />
          <h1 className="font-display text-white text-2xl font-light">{copy.heading}</h1>
          <p className="text-white/40 font-body text-sm mt-1">{copy.subtitle}</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          {checking ? (
            <div className="text-center py-6">
              <div className="w-8 h-8 border-2 border-white/20 border-t-gold rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/50 text-sm font-body">Verifying your {copy.link}…</p>
            </div>
          ) : done ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
                <CheckCircle size={26} className="text-green-400" />
              </div>
              <p className="text-white/70 font-body text-sm">Password set! Redirecting you to login…</p>
            </div>
          ) : !ready ? (
            <div className="text-center space-y-4">
              <p className="text-red-300 font-body text-sm">
                {linkError ? linkErrorMessage(linkError) : `This ${copy.link} is invalid or has expired.`}
              </p>
              <Link
                to="/partner/forgot-password"
                className="block w-full bg-gold text-purple-deep font-body font-semibold py-3 rounded text-sm hover:bg-gold-light transition-colors"
              >
                Send me a new link
              </Link>
              <p className="text-white/45 font-body text-xs">
                You can also ask the ministry office to send you a new link, or contact support.
              </p>
              <Link to="/partner/login" className="text-gold hover:text-gold-light text-sm font-body inline-block">← Go to login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm font-body">{error}</div>}
              <div>
                <label className="text-white/50 text-xs font-body uppercase tracking-widest block mb-2">New Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                    className="w-full bg-white/10 border border-white/15 rounded pl-9 pr-4 py-3 text-white text-sm font-body placeholder-white/30 focus:outline-none focus:border-gold"
                    placeholder="At least 8 characters"
                  />
                </div>
              </div>
              <div>
                <label className="text-white/50 text-xs font-body uppercase tracking-widest block mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                    className="w-full bg-white/10 border border-white/15 rounded pl-9 pr-4 py-3 text-white text-sm font-body placeholder-white/30 focus:outline-none focus:border-gold"
                    placeholder="Repeat password"
                  />
                </div>
              </div>
              <button
                type="submit" disabled={saving}
                className="w-full bg-gold text-purple-deep font-body font-semibold py-3 rounded text-sm hover:bg-gold-light transition-colors disabled:opacity-60"
              >
                {saving ? 'Setting password…' : copy.button}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
