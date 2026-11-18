import { useCallback, useEffect, useState } from 'react';
import { Lock, RotateCcw } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Field, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useForm } from '../../lib/useForm';
import { formatDateTime } from '../../lib/format';

// Each rule, in the order someone thinks about a service: opening, arriving,
// leaving, closing.
const FIELDS = [
  {
    name: 'opensBeforeMinutes', label: 'Clock-in opens', unit: 'minutes before',
    hint: 'Workers can clock in this many minutes before a service starts.',
  },
  {
    name: 'graceMinutes', label: 'Grace period', unit: 'minutes',
    hint: 'Clocking in up to this many minutes after the start still counts as on time.',
  },
  {
    name: 'veryLateMinutes', label: 'Very late after', unit: 'minutes',
    hint: 'Clocking in more than this many minutes after the start counts as very late, not just late. Must be longer than the grace period.',
  },
  {
    name: 'leftEarlyMinutes', label: 'Left early', unit: 'minutes',
    hint: 'Clocking out more than this many minutes before the end is recorded as leaving early.',
  },
  {
    name: 'minValidMinutes', label: 'Shortest attendance', unit: 'minutes',
    hint: 'Anyone present for less than this is marked as a short attendance.',
  },
  {
    name: 'clockOutAfterMinutes', label: 'Clock-out stays open', unit: 'minutes after',
    hint: 'Workers can clock out up to this many minutes after a service ends. Anyone still clocked in after that is marked “didn’t clock out” — their attendance still counts.',
  },
  {
    name: 'defaultRadiusM', label: 'Usual venue distance', unit: 'metres',
    hint: 'How close to the venue workers must be to clock in by GPS — the starting value for each new service, which can then be changed.',
  },
];

/** The clocking rules for every service. A super administrator changes them; administrators can see them. */
export default function Settings() {
  const { isSuperAdmin } = useAuth();
  const [loaded, setLoaded] = useState(null);
  const [changedBy, setChangedBy] = useState(null);   // { name, at }
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState(false);
  const form = useForm(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const { settings, updatedByName, updatedAt } = await api.get('/admin/settings');
      setLoaded(settings);
      setChangedBy(updatedByName ? { name: updatedByName, at: updatedAt } : null);
      form.setValues(Object.fromEntries(FIELDS.map((f) => [f.name, settings?.[f.name] ?? ''])));
    } catch (err) { setLoadError(err.message); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setSaved(false);
    const v = form.values;
    const bad = {};
    const body = {};
    for (const f of FIELDS) {
      const text = String(v[f.name]).trim();
      const n = Number(text);
      if (text === '' || !Number.isInteger(n) || n < 0) bad[f.name] = 'Enter a whole number, 0 or more.';
      else body[f.name] = n;
    }
    if (Object.keys(bad).length) { form.setErrors(bad); return; }
    const res = await form.submit(() => api.put('/admin/settings', body));
    if (res) {
      setLoaded(res.settings);
      if (res.updatedByName) setChangedBy({ name: res.updatedByName, at: res.updatedAt });
      form.setValues(Object.fromEntries(FIELDS.map((f) => [f.name, res.settings?.[f.name] ?? body[f.name]])));
      setSaved(true);
    }
  }

  const v = form.values;
  return (
    <AppShell title="Settings">
      <PageHeader title="Settings"
        subtitle={changedBy ? `The clocking rules for every service. Last changed by ${changedBy.name}${changedBy.at ? `, ${formatDateTime(changedBy.at)}` : ''}.` : 'The clocking rules for every service.'} />

      {!isSuperAdmin && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-purple-brand/10 bg-white px-4 py-3 text-sm font-body text-ink/60">
          <Lock size={15} className="flex-shrink-0 mt-0.5 text-ink/40" aria-hidden="true" />
          Only a super administrator can change these. Ask one if something needs to change.
        </div>
      )}

      {loadError && (
        <div className="space-y-3 mb-4">
          <Alert>{loadError}</Alert>
          <button type="button" className="btn-outline px-4 py-2.5" onClick={load}><RotateCcw size={15} /> Try again</button>
        </div>
      )}

      {!loaded || !v ? (
        !loadError && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : (
        <form onSubmit={save} className="card p-5 sm:p-6 max-w-3xl" noValidate>
          <fieldset disabled={!isSuperAdmin || form.busy} className="space-y-5">
            <legend className="sr-only">Clocking rules</legend>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
              {FIELDS.map((f) => (
                <Field key={f.name} label={f.label} error={form.errors[f.name]} hint={f.hint}>
                  <NumberWithUnit unit={f.unit} value={v[f.name]} onChange={form.set(f.name)} />
                </Field>
              ))}
            </div>
          </fieldset>
          {isSuperAdmin && (
            <div className="mt-6 space-y-3">
              <Alert>{form.formError}</Alert>
              {saved && <Alert kind="success">Saved.</Alert>}
              <div className="flex justify-end">
                <button type="submit" className="btn-primary" disabled={form.busy}>{form.busy ? <Spinner size={15} /> : 'Save settings'}</button>
              </div>
            </div>
          )}
        </form>
      )}
    </AppShell>
  );
}

/** A number box with its unit beside it; the id comes from Field, so the label names the box. */
function NumberWithUnit({ id, unit, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <input id={id} className="input w-28 disabled:bg-mist disabled:text-ink/60" type="number" inputMode="numeric" min={0} step={1}
        value={value} onChange={onChange} />
      <span className="text-sm font-body text-ink/50">{unit}</span>
    </div>
  );
}
