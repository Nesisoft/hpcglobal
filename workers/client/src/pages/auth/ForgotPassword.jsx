import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthScreen from '../../components/AuthScreen';
import { Alert, Field, PasswordChecklist, PasswordInput, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useForm } from '../../lib/useForm';

/** Two steps on one screen: ask for a code, then type it with a new password. */
export default function ForgotPassword() {
  const { applySession } = useAuth();
  const navigate = useNavigate();
  const [sent, setSent] = useState('');
  const form = useForm({ email: '', code: '', password: '' });

  async function askForCode(e) {
    e?.preventDefault();
    const res = await form.submit(() => api.post('/auth/forgot-password', { email: form.values.email }, { auth: false }));
    if (res) setSent(res.message);
  }

  async function reset(e) {
    e.preventDefault();
    const res = await form.submit(() => api.post('/auth/reset-password', form.values, { auth: false }));
    if (!res) return;
    if (res.token) {
      applySession(res);
      navigate('/', { replace: true });
    } else {
      navigate('/login', { replace: true, state: { notice: 'Your password has been changed. Sign in with the new one.' } });
    }
  }

  const v = form.values;
  return (
    <AuthScreen
      title="Reset your password"
      subtitle={sent ? 'Enter the code from the email and choose a new password.' : 'We’ll email you a 6-digit code.'}
      footer={<Link to="/login" className="text-gold hover:text-gold-light">Back to sign in</Link>}
    >
      {!sent ? (
        <form onSubmit={askForCode} className="space-y-4" noValidate>
          <Alert dark>{form.formError}</Alert>
          <Field label="Email" dark htmlFor="email" error={form.errors.email}>
            <input id="email" type="email" inputMode="email" autoComplete="email" className="input-dark"
              value={v.email} onChange={form.set('email')} placeholder="you@example.com" />
          </Field>
          <button type="submit" disabled={form.busy} className="btn-primary w-full">
            {form.busy ? <><Spinner size={15} /> Sending…</> : 'Email me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4" noValidate>
          <Alert kind="success" dark>{sent}</Alert>
          <Alert dark>{form.formError}</Alert>
          <Field label="6-digit code" dark htmlFor="code" error={form.errors.code}>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              className="input-dark text-center tracking-[0.5em] text-lg"
              value={v.code} onChange={(e) => form.set('code')(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="New password" dark htmlFor="password" error={form.errors.password}>
            <PasswordInput id="password" dark autoComplete="new-password" value={v.password} onChange={form.set('password')} />
            <PasswordChecklist password={v.password} dark />
          </Field>
          <button type="submit" disabled={form.busy} className="btn-primary w-full">
            {form.busy ? <><Spinner size={15} /> Saving…</> : 'Set new password'}
          </button>
          <button type="button" onClick={askForCode} disabled={form.busy}
            className="w-full text-white/40 hover:text-white/70 text-xs font-body">
            Didn’t get it? Send another code
          </button>
        </form>
      )}
    </AuthScreen>
  );
}
