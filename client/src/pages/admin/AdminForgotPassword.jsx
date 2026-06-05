import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

export default function AdminForgotPassword() {
  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-purple-deep flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="https://i.ibb.co/BVYBsKKY/LOGO.png" alt="HPC Global" className="h-16 w-auto mx-auto mb-3 object-contain" />
          <h1 className="font-display text-white text-2xl font-light">Reset Password</h1>
          <p className="text-white/40 font-body text-sm mt-1">Enter your email to receive a reset link</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
                <span className="text-green-400 text-2xl">✓</span>
              </div>
              <p className="text-white/70 font-body text-sm">
                If that email is registered, a reset link has been sent. Check your inbox.
              </p>
              <Link to="/admin/login" className="text-gold hover:text-gold-light text-sm font-body transition-colors">
                ← Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm font-body">{error}</div>}
              <div>
                <label className="text-white/50 text-xs font-body uppercase tracking-widest block mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-white/10 border border-white/15 rounded px-4 py-3 text-white text-sm font-body placeholder-white/30 focus:outline-none focus:border-gold"
                  placeholder="admin@hpcglobal.org"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold text-purple-deep font-body font-semibold py-3 rounded text-sm hover:bg-gold-light transition-colors disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
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
