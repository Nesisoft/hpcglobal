import { useEffect, useState } from 'react';
import { Hourglass, Ban, XCircle, Pencil } from 'lucide-react';
import AuthScreen from '../components/AuthScreen';
import { Alert, Field, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useForm } from '../lib/useForm';

/**
 * Where someone lands until their account is approved — or when it has been
 * declined or suspended. While waiting it checks every 30 seconds, so the
 * moment their HOD approves them the app opens without a reload.
 */
export default function Waiting() {
  const { worker, refresh, logout } = useAuth();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (worker.status !== 'PENDING') return undefined;
    const timer = setInterval(refresh, 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [worker.status, refresh]);

  const content = {
    PENDING: {
      icon: Hourglass,
      title: `Thank you, ${worker.firstName}`,
      text: <>Your account is waiting for approval by the head of the <strong className="text-white">{worker.department?.name ?? 'your'}</strong> department.
        This page opens the app by itself once you’re approved.</>,
    },
    DECLINED: {
      icon: XCircle,
      title: 'Registration not approved',
      text: 'Your registration was not approved. Please speak to your head of department or the church office.',
    },
    SUSPENDED: {
      icon: Ban,
      title: 'Account suspended',
      text: 'Your account is suspended. Please speak to your head of department or the church office.',
    },
  }[worker.status] ?? { icon: Ban, title: 'Account unavailable', text: '' };
  const Icon = content.icon;

  return (
    <AuthScreen title={content.title}>
      {editing ? (
        <EditDetails onDone={() => setEditing(false)} />
      ) : (
        <div className="text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-gold/15 ring-1 ring-gold/30 flex items-center justify-center">
            <Icon size={24} className="text-gold" />
          </div>
          <p className="text-white/70 font-body text-sm leading-relaxed">{content.text}</p>
          {worker.statusNote && (
            <p className="text-white/55 font-body text-sm italic">“{worker.statusNote}”</p>
          )}
          {worker.status === 'PENDING' && (
            <button onClick={() => setEditing(true)} className="btn-ghost">
              <Pencil size={14} /> Wrong name or department? Fix it here
            </button>
          )}
          <div className="pt-2">
            <button onClick={logout} className="text-white/40 hover:text-white/70 text-xs font-body">Sign out</button>
          </div>
        </div>
      )}
    </AuthScreen>
  );
}

function EditDetails({ onDone }) {
  const { worker, setWorker } = useAuth();
  const [departments, setDepartments] = useState([]);
  const form = useForm({
    firstName: worker.firstName, lastName: worker.lastName, phone: worker.phoneDisplay,
    gender: worker.gender, departmentId: worker.department?.id ?? '',
  });
  useEffect(() => { api.get('/departments', { auth: false }).then((r) => setDepartments(r.departments)).catch(() => {}); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    const res = await form.submit(() => api.put('/me', form.values));
    if (res) { setWorker(res.worker); onDone(); }
  }
  const v = form.values;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Alert dark>{form.formError}</Alert>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" dark error={form.errors.firstName}>
          <input className="input-dark" value={v.firstName} onChange={form.set('firstName')} />
        </Field>
        <Field label="Last name" dark error={form.errors.lastName}>
          <input className="input-dark" value={v.lastName} onChange={form.set('lastName')} />
        </Field>
      </div>
      <Field label="Phone" dark error={form.errors.phone}>
        <input className="input-dark" type="tel" value={v.phone} onChange={form.set('phone')} />
      </Field>
      <Field label="Department" dark error={form.errors.departmentId}>
        <select className="input-dark" value={v.departmentId} onChange={form.set('departmentId')}>
          {departments.map((d) => <option key={d.id} value={d.id} className="text-ink">{d.name}</option>)}
        </select>
      </Field>
      <div className="flex gap-3">
        <button type="button" onClick={onDone} className="flex-1 py-3 rounded-sm border border-white/15 text-white/70 text-sm font-body hover:border-white/30">Cancel</button>
        <button type="submit" disabled={form.busy} className="btn-primary flex-1">{form.busy ? <Spinner size={15} /> : 'Save'}</button>
      </div>
    </form>
  );
}
