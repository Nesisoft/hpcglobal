import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Check, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { adminApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/admin/AdminLayout';
import HodLayout from '../components/hod/HodLayout';
import FormField from '../components/admin/FormField';

const MIN_LENGTH = 8;

/**
 * Change password, for any signed-in account.
 *
 * Doubles as the gate a HoD meets at first sign-in, when the office typed their
 * password for them: in that mode there is nothing else to navigate to, so the
 * page explains why rather than just presenting a form.
 */
export default function ChangePassword() {
  const { user, applyTokens } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  const isHod  = user?.role === 'HOD';
  const forced = Boolean(user?.mustChangePassword);
  const Layout = isHod ? HodLayout : AdminLayout;
  const home   = isHod ? '/hod' : '/admin';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (next.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    if (next === current) {
      setError('Choose a password different from your current one.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await adminApi.changePassword({
        currentPassword: current,
        newPassword:     next,
      });
      // Swap in the tokens that come back, otherwise the session still carries
      // the flag that sent us here and the portal stays locked.
      applyTokens(data);
      setDone(true);
      setTimeout(() => navigate(home, { replace: true }), 1200);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not change your password. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="Change Password">
      <div className="max-w-md">
        <div className="mb-6">
          <h1 className="font-display text-2xl text-ink font-light">Change password</h1>
          <p className="text-ink/50 text-sm font-body mt-1">
            Signed in as {user?.email}
          </p>
        </div>

        {forced && (
          <div className="bg-gold/10 border border-gold/30 rounded-lg px-4 py-3 mb-6 text-sm font-body text-ink/70 flex items-start gap-2">
            <ShieldAlert size={16} className="text-gold flex-shrink-0 mt-0.5" />
            <span>
              Your account was set up with a password chosen by the church office.
              Please replace it with one only you know before you carry on.
            </span>
          </div>
        )}

        {done && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 text-green-700 text-sm font-body flex items-center gap-2">
            <Check size={16} /> Password changed. Taking you back…
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-purple-brand/8 p-5 sm:p-6 space-y-4">
          <FormField label="Current password" required>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                className="input pr-9"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60"
                aria-label={show ? 'Hide passwords' : 'Show passwords'}
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </FormField>

          <FormField label="New password" hint={`At least ${MIN_LENGTH} characters.`} required>
            <input
              type={show ? 'text' : 'password'}
              className="input"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
          </FormField>

          <FormField label="Confirm new password" required>
            <input
              type={show ? 'text' : 'password'}
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </FormField>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            {/* Nothing to go back to while the change is required. */}
            {!forced && (
              <button type="button" onClick={() => navigate(home)} className="btn-outline text-sm px-5 py-2.5">
                Cancel
              </button>
            )}
            <button type="submit" disabled={saving || done} className="btn-primary text-sm px-5 py-2.5 disabled:opacity-50">
              {saving ? 'Saving…' : <><KeyRound size={14} /> Change Password</>}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
