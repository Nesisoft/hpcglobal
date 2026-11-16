import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthScreen from '../../components/AuthScreen';
import { Alert, Field, PasswordChecklist, PasswordInput, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useForm } from '../../lib/useForm';

export default function Register() {
  const { applySession } = useAuth();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState(null);
  const [loadError, setLoadError] = useState('');
  const form = useForm({
    firstName: '', lastName: '', email: '', phone: '', gender: '', departmentId: '', password: '',
  });

  useEffect(() => {
    api.get('/departments', { auth: false })
      .then(({ departments: list }) => setDepartments(list))
      .catch((err) => setLoadError(err.message));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    const session = await form.submit(() => api.post('/auth/register', form.values, { auth: false }));
    if (session) {
      applySession(session);
      navigate('/', { replace: true });
    }
  }

  const v = form.values;
  return (
    <AuthScreen
      wide
      title="Join the workforce"
      subtitle="Create your account. Your head of department approves it, then you can clock in."
      footer={<>Already have an account? <Link to="/login" className="text-gold hover:text-gold-light font-medium">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert dark>{form.formError || loadError}</Alert>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="First name" dark required htmlFor="firstName" error={form.errors.firstName}>
            <input id="firstName" autoComplete="given-name" className="input-dark" value={v.firstName} onChange={form.set('firstName')} />
          </Field>
          <Field label="Last name" dark required htmlFor="lastName" error={form.errors.lastName}>
            <input id="lastName" autoComplete="family-name" className="input-dark" value={v.lastName} onChange={form.set('lastName')} />
          </Field>
        </div>
        <Field label="Email" dark required htmlFor="email" error={form.errors.email} hint="You sign in with this, and reset codes come here.">
          <input id="email" type="email" inputMode="email" autoComplete="email" className="input-dark"
            value={v.email} onChange={form.set('email')} placeholder="you@example.com" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Phone" dark required htmlFor="phone" error={form.errors.phone}>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" className="input-dark"
              value={v.phone} onChange={form.set('phone')} placeholder="024 412 3456" />
          </Field>
          <Field label="Gender" dark required error={form.errors.gender}>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Gender">
              {[['MALE', 'Male'], ['FEMALE', 'Female']].map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={v.gender === value}
                  onClick={() => form.set('gender')(value)}
                  className={`py-3 rounded text-sm font-body border transition-colors ${
                    v.gender === value ? 'bg-gold/15 border-gold text-gold' : 'bg-white/10 border-white/15 text-white/70 hover:border-white/30'}`}>
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Department" dark required htmlFor="departmentId" error={form.errors.departmentId}
          hint="Your head of department will approve your account.">
          <select id="departmentId" className="input-dark appearance-none" value={v.departmentId} onChange={form.set('departmentId')}
            disabled={!departments}>
            <option value="" className="text-ink">{departments ? 'Choose your department' : 'Loading…'}</option>
            {(departments || []).map((d) => <option key={d.id} value={d.id} className="text-ink">{d.name}</option>)}
          </select>
        </Field>
        <Field label="Password" dark required htmlFor="password" error={form.errors.password}>
          <PasswordInput id="password" dark autoComplete="new-password" value={v.password} onChange={form.set('password')} />
          <PasswordChecklist password={v.password} dark />
        </Field>
        <button type="submit" disabled={form.busy} className="btn-primary w-full">
          {form.busy ? <><Spinner size={15} /> Creating your account…</> : 'Create account'}
        </button>
      </form>
    </AuthScreen>
  );
}
