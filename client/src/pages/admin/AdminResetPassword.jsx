import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';

export default function AdminResetPassword() {
  const [searchParams]      = useSearchParams();
  const navigate            = useNavigate();
  const token               = searchParams.get('token') ?? '';
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/admin/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-purple-deep flex items-center justify-center p-4">
        <div className="text-center text-white/60 font-body">
          <p>Invalid reset link.</p>
          <Link to="/admin/forgot-password" className="text-gold hover:text-gold-light mt-3 block text-sm">Request a new one</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-purple-deep flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-gold flex items-center justify-center text-purple-deep font-display font-semibold text-lg mx-auto mb-3">H</div>
          <h1 className="font-display text-white text-2xl font-light">New Password</h1>
          <p className="text-white/40 font-body text-sm mt-1">Choose a strong password</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          {done ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
                <span className="text-green-400 text-2xl">✓</span>
              </div>
              <p className="text-white/70 font-body text-sm">Password updated! Redirecting to login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm font-body">{error}</div>}
              <div>
                <label className="text-white/50 text-xs font-body uppercase tracking-widest block mb-2">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-white/10 border border-white/15 rounded px-4 py-3 text-white text-sm font-body placeholder-white/30 focus:outline-none focus:border-gold"
                  placeholder="Min. 8 characters"
                />
              </div>
              <div>
                <label className="text-white/50 text-xs font-body uppercase tracking-widest block mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full bg-white/10 border border-white/15 rounded px-4 py-3 text-white text-sm font-body placeholder-white/30 focus:outline-none focus:border-gold"
                  placeholder="Repeat password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold text-purple-deep font-body font-semibold py-3 rounded text-sm hover:bg-gold-light transition-colors disabled:opacity-60"
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
              <div className="text-center">
                <Link to="/admin/login" className="text-white/35 hover:text-white/60 text-xs font-body transition-colors">
                  ← Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
