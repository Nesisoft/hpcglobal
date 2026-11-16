import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthScreen from '../../components/AuthScreen';
import { Alert, Field, PasswordInput, Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useForm } from '../../lib/useForm';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm({ email: '', password: '' });
  const notice = location.state?.notice;

  async function onSubmit(e) {
    e.preventDefault();
    const ok = await form.submit(async () => {
      try {
        return await login(form.values.email, form.values.password);
      } catch (err) {
        // Declined or suspended: say why, with the note they were given.
        if (err.body?.note) err.message = `${err.message} (${err.body.note})`;
        throw err;
      }
    });
    if (ok) navigate(location.state?.from || '/', { replace: true });
  }

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to clock in and see your attendance."
      footer={<>New here? <Link to="/register" className="text-gold hover:text-gold-light font-medium">Create your account</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {notice && <Alert kind="success" dark>{notice}</Alert>}
        <Alert dark>{form.formError}</Alert>
        <Field label="Email" dark htmlFor="email" error={form.errors.email}>
          <input id="email" type="email" autoComplete="email" inputMode="email" className="input-dark"
            value={form.values.email} onChange={form.set('email')} placeholder="you@example.com" required />
        </Field>
        <Field label="Password" dark htmlFor="password" error={form.errors.password}>
          <PasswordInput id="password" dark autoComplete="current-password"
            value={form.values.password} onChange={form.set('password')} placeholder="••••••••••" required />
        </Field>
        <button type="submit" disabled={form.busy} className="btn-primary w-full">
          {form.busy ? <><Spinner size={15} /> Signing in…</> : 'Sign in'}
        </button>
        <div className="text-center">
          <Link to="/forgot-password" className="text-white/40 hover:text-white/70 text-xs font-body">Forgot your password?</Link>
        </div>
      </form>
    </AuthScreen>
  );
}
