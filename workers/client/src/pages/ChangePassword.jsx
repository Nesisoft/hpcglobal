import AuthScreen from '../components/AuthScreen';
import { Alert, Field, PasswordChecklist, PasswordInput, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useForm } from '../lib/useForm';

/**
 * Shown, and nothing else, after the office has given someone a temporary
 * password: they choose their own before the app opens, so a password
 * another person has seen is never kept.
 */
export default function ChangePassword() {
  const { applySession, logout, worker } = useAuth();
  const form = useForm({ currentPassword: '', newPassword: '' });

  async function onSubmit(e) {
    e.preventDefault();
    const res = await form.submit(() => api.post('/me/password', form.values));
    if (res) applySession(res);
  }

  return (
    <AuthScreen title="Choose your own password" subtitle={`Hello ${worker.firstName} — you signed in with a temporary password from the church office.`}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert dark>{form.formError}</Alert>
        <Field label="Temporary password" dark htmlFor="current" error={form.errors.currentPassword}>
          <PasswordInput id="current" dark autoComplete="current-password" value={form.values.currentPassword} onChange={form.set('currentPassword')} />
        </Field>
        <Field label="New password" dark htmlFor="new" error={form.errors.newPassword}>
          <PasswordInput id="new" dark autoComplete="new-password" value={form.values.newPassword} onChange={form.set('newPassword')} />
          <PasswordChecklist password={form.values.newPassword} dark />
        </Field>
        <button type="submit" disabled={form.busy} className="btn-primary w-full">
          {form.busy ? <><Spinner size={15} /> Saving…</> : 'Save and continue'}
        </button>
        <button type="button" onClick={logout} className="w-full text-white/40 hover:text-white/70 text-xs font-body">Sign out</button>
      </form>
    </AuthScreen>
  );
}
