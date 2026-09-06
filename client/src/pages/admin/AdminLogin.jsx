import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LOGO_URL } from '../../config/brand';

export default function AdminLogin() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const signedIn = await login(email, password);
      // HoDs use this same form but belong in the reporting portal.
      navigate(signedIn?.role === 'HOD' ? '/hod' : '/admin');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-purple-deep flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="HPC Global" className="h-16 w-auto mx-auto mb-3 object-contain" />
          <h1 className="font-display text-white text-2xl font-light">HPC Global Admin</h1>
          <p className="text-white/40 font-body text-sm mt-1">Admins and heads of department</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-8 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm font-body">{error}</div>}
          <div>
            <label className="text-white/50 text-xs font-body uppercase tracking-widest block mb-2">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full bg-white/10 border border-white/15 rounded px-4 py-3 text-white text-sm font-body placeholder-white/30 focus:outline-none focus:border-gold"
              placeholder="admin@hpcglobal.org" />
          </div>
          <div>
            <label className="text-white/50 text-xs font-body uppercase tracking-widest block mb-2">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full bg-white/10 border border-white/15 rounded px-4 py-3 text-white text-sm font-body placeholder-white/30 focus:outline-none focus:border-gold"
              placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-gold text-purple-deep font-body font-semibold py-3 rounded text-sm hover:bg-gold-light transition-colors disabled:opacity-60">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <div className="text-center pt-1">
            <Link to="/admin/forgot-password" className="text-white/35 hover:text-white/60 text-xs font-body transition-colors">
              Forgot password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
