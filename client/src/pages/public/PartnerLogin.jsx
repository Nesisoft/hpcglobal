import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePartnerAuth } from '../../context/PartnerAuthContext';

export default function PartnerLogin() {
  const { login }         = usePartnerAuth();
  const navigate          = useNavigate();
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, pass);
      navigate('/partner/portal');
    } catch (err) {
      setError(err.message || err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-purple-deep flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="https://i.ibb.co/BVYBsKKY/LOGO.png" alt="HPC Global" className="h-16 w-auto mx-auto mb-3 object-contain" />
          <h1 className="font-display text-white text-2xl font-light">Partner Portal</h1>
          <p className="text-white/40 font-body text-sm mt-1">Sign in to access your partner benefits</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-8 space-y-4">
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
          <div>
            <label className="text-white/50 text-xs font-body uppercase tracking-widest block mb-2">Password</label>
            <input
              type="password" value={pass} onChange={(e) => setPass(e.target.value)} required
              className="w-full bg-white/10 border border-white/15 rounded px-4 py-3 text-white text-sm font-body placeholder-white/30 focus:outline-none focus:border-gold"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-gold text-purple-deep font-body font-semibold py-3 rounded text-sm hover:bg-gold-light transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="text-center text-white/35 text-xs font-body pt-1">
            Not a partner yet?{' '}
            <Link to="/partner" className="text-gold hover:text-gold-light transition-colors">Apply to partner</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
