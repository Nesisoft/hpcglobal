import { useState } from 'react';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Alert, Field, PageHeader, PasswordChecklist, PasswordInput, Pill, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useForm } from '../lib/useForm';
import { formatDate, ROLE_LABEL } from '../lib/format';

export default function Profile() {
  const { worker, isHod, logout } = useAuth();
  return (
    <AppShell title="My profile">
      <PageHeader title="My profile" subtitle={worker.email} />
      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Details />
          <Password />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-5 space-y-3">
            <h2 className="font-display text-xl text-ink">Your account</h2>
            <Row label="Department" value={worker.department?.name ?? 'None'} />
            <Row label="Role" value={<span className="flex gap-1.5 flex-wrap justify-end">
              <Pill>{ROLE_LABEL[worker.role]}</Pill>{isHod && <Pill tone="gold">Head of department</Pill>}
            </span>} />
            <Row label="Approved" value={worker.approvedAt ? `${formatDate(worker.approvedAt)}${worker.approvedByName ? ` by ${worker.approvedByName}` : ''}` : '—'} />
            <Row label="Member since" value={formatDate(worker.createdAt)} />
            <p className="text-ink/40 font-body text-xs pt-1">To change your department or email, speak to your head of department or the church office.</p>
          </section>
          <SignOut onSignOut={logout} />
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm font-body">
      <span className="text-ink/45">{label}</span>
      <span className="text-ink/80 text-right">{value}</span>
    </div>
  );
}

function Details() {
  const { worker, setWorker } = useAuth();
  const [saved, setSaved] = useState(false);
  const form = useForm({ firstName: worker.firstName, lastName: worker.lastName, phone: worker.phoneDisplay, gender: worker.gender });

  async function onSubmit(e) {
    e.preventDefault();
    setSaved(false);
    const res = await form.submit(() => api.put('/me', form.values));
    if (res) { setWorker(res.worker); setSaved(true); }
  }
  const v = form.values;
  return (
    <form onSubmit={onSubmit} className="card p-5 sm:p-6 space-y-4" noValidate>
      <h2 className="font-display text-xl text-ink">Your details</h2>
      <Alert>{form.formError}</Alert>
      {saved && <Alert kind="success">Saved.</Alert>}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="First name" htmlFor="firstName" error={form.errors.firstName}>
          <input id="firstName" className="input" value={v.firstName} onChange={form.set('firstName')} />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={form.errors.lastName}>
          <input id="lastName" className="input" value={v.lastName} onChange={form.set('lastName')} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={form.errors.phone}>
          <input id="phone" type="tel" className="input" value={v.phone} onChange={form.set('phone')} />
        </Field>
        <Field label="Gender" htmlFor="gender" error={form.errors.gender}>
          <select id="gender" className="input" value={v.gender} onChange={form.set('gender')}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
        </Field>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={form.busy} className="btn-primary">{form.busy ? <Spinner size={15} /> : 'Save changes'}</button>
      </div>
    </form>
  );
}

function Password() {
  const { applySession } = useAuth();
  const [saved, setSaved] = useState(false);
  const form = useForm({ currentPassword: '', newPassword: '' });

  async function onSubmit(e) {
    e.preventDefault();
    setSaved(false);
    const res = await form.submit(() => api.post('/me/password', form.values));
    if (res) {
      applySession(res);
      form.setValues({ currentPassword: '', newPassword: '' });
      setSaved(true);
    }
  }
  return (
    <form onSubmit={onSubmit} className="card p-5 sm:p-6 space-y-4" noValidate>
      <h2 className="font-display text-xl text-ink">Change password</h2>
      <Alert>{form.formError}</Alert>
      {saved && <Alert kind="success">Password changed. Any other phone or computer signed in to your account has been signed out.</Alert>}
      <Field label="Current password" htmlFor="currentPassword" error={form.errors.currentPassword}>
        <PasswordInput id="currentPassword" autoComplete="current-password" value={form.values.currentPassword} onChange={form.set('currentPassword')} />
      </Field>
      <Field label="New password" htmlFor="newPassword" error={form.errors.newPassword}>
        <PasswordInput id="newPassword" autoComplete="new-password" value={form.values.newPassword} onChange={form.set('newPassword')} />
        <PasswordChecklist password={form.values.newPassword} />
      </Field>
      <div className="flex justify-end">
        <button type="submit" disabled={form.busy} className="btn-primary">{form.busy ? <Spinner size={15} /> : 'Change password'}</button>
      </div>
    </form>
  );
}

function SignOut({ onSignOut }) {
  const { applySession } = useAuth();
  const [state, setState] = useState({ busy: false, done: false, error: '' });

  async function elsewhere() {
    setState({ busy: true, done: false, error: '' });
    try {
      applySession(await api.post('/me/sign-out-elsewhere'));
      setState({ busy: false, done: true, error: '' });
    } catch (err) {
      setState({ busy: false, done: false, error: err.message });
    }
  }
  return (
    <section className="card p-5 space-y-3">
      <h2 className="font-display text-xl text-ink">Signing out</h2>
      <Alert>{state.error}</Alert>
      {state.done && <Alert kind="success">Every other phone and computer has been signed out.</Alert>}
      <button onClick={elsewhere} disabled={state.busy} className="btn-outline w-full">
        <MonitorSmartphone size={15} /> Sign out everywhere else
      </button>
      <button onClick={onSignOut} className="btn-outline-danger w-full">
        <LogOut size={15} /> Sign out
      </button>
    </section>
  );
}
