import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Send, AlertCircle, ArrowLeft } from 'lucide-react';
import { hodApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import HodLayout from '../../components/hod/HodLayout';
import FormField from '../../components/admin/FormField';
import Spinner from '../../components/ui/Spinner';
import {
  PERIOD_TYPES, PERIOD_LABELS, ATTENDANCE_FIELDS, NARRATIVE_FIELDS, defaultPeriod,
} from '../../config/reports';

const BLANK = {
  periodType: 'WEEKLY',
  ...defaultPeriod('WEEKLY'),
  ...Object.fromEntries(ATTENDANCE_FIELDS.map((f) => [f.key, ''])),
  absenteeCount: '',
  absenteeNames: '',
  followUpNotes: '',
  ...Object.fromEntries(NARRATIVE_FIELDS.map((f) => [f.key, ''])),
  offeringAmount: '',
};

/** Server nulls become '' so every input stays controlled. */
const toForm = (r) => Object.fromEntries(
  Object.keys(BLANK).map((k) => {
    const v = r[k];
    if (k === 'periodStart' || k === 'periodEnd') return [k, String(v).slice(0, 10)];
    return [k, v ?? ''];
  })
);

function Section({ title, hint, children }) {
  return (
    <section className="bg-white rounded-xl border border-purple-brand/8 p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="font-display text-lg text-ink font-light">{title}</h2>
        {hint && <p className="text-ink/40 text-xs font-body mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function HodReportForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm]       = useState(BLANK);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  const meFn = useCallback(() => hodApi.me(), []);
  const { data: me } = useApi(meFn);

  const existingFn = useCallback(
    () => (id ? hodApi.getReport(id) : Promise.resolve({ data: null })),
    [id]
  );
  const { data: existing, loading: loadingExisting, error: existingError } = useApi(existingFn, [id]);

  useEffect(() => {
    if (existing) setForm(toForm(existing));
  }, [existing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Switching period type re-dates the period, but only while creating — an
  // existing report's dates are what it was actually filed for.
  function changePeriodType(e) {
    const periodType = e.target.value;
    setForm((f) => ({ ...f, periodType, ...(isEdit ? {} : defaultPeriod(periodType)) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.activities.trim()) {
      setError('Please describe the activities the department carried out.');
      return;
    }
    if (form.periodEnd < form.periodStart) {
      setError('Period end cannot be before period start.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) await hodApi.updateReport(id, form);
      else        await hodApi.submitReport(form);
      setDone(true);
      setTimeout(() => navigate('/hod/reports'), 1200);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not save the report. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const department = me?.department;
  const title = isEdit ? 'Edit Report' : 'New Report';

  if (isEdit && loadingExisting) {
    return (
      <HodLayout title={title} department={department}>
        <div className="py-20 flex justify-center"><Spinner /></div>
      </HodLayout>
    );
  }

  if (isEdit && existingError) {
    return (
      <HodLayout title={title} department={department}>
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body">
          {existingError}
        </div>
      </HodLayout>
    );
  }

  return (
    <HodLayout title={title} department={department}>
      <div className="max-w-3xl">
        {isEdit && (
          <button onClick={() => navigate('/hod/reports')}
            className="inline-flex items-center gap-1.5 text-purple-brand text-sm font-body hover:underline mb-5">
            <ArrowLeft size={15} /> My Reports
          </button>
        )}

        <div className="mb-6">
          <h1 className="font-display text-2xl text-ink font-light">
            {isEdit ? 'Edit department report' : 'Department report'}
          </h1>
          <p className="text-ink/50 text-sm font-body mt-1">
            {department
              ? <>Reporting for <strong className="text-purple-brand font-medium">{department}</strong></>
              : 'No department is set on your account yet.'}
          </p>
        </div>

        {!department && (
          <div className="bg-gold/10 border border-gold/30 rounded-lg px-4 py-3 mb-6 text-sm font-body text-ink/70 flex items-start gap-2">
            <AlertCircle size={16} className="text-gold flex-shrink-0 mt-0.5" />
            <span>
              Your account has no department assigned, so reports cannot be filed yet.
              Please ask an administrator to add your department name.
            </span>
          </div>
        )}

        {done && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 text-green-700 text-sm font-body flex items-center gap-2">
            <Check size={16} /> Report {isEdit ? 'updated' : 'submitted'}. Taking you to your reports…
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Section title="Reporting period" hint="What stretch of time this report covers.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="Period" required>
                <select className="input" value={form.periodType} onChange={changePeriodType}>
                  {PERIOD_TYPES.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
                </select>
              </FormField>
              <FormField label="From" required>
                <input type="date" className="input" value={form.periodStart} onChange={set('periodStart')} required />
              </FormField>
              <FormField label="To" required>
                <input type="date" className="input" value={form.periodEnd} onChange={set('periodEnd')} required />
              </FormField>
            </div>
          </Section>

          <Section title="Attendance" hint="Leave a box empty if it does not apply to your department.">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {ATTENDANCE_FIELDS.map(({ key, label }) => (
                <FormField key={key} label={label}>
                  <input type="number" min="0" className="input" value={form[key]} onChange={set(key)} placeholder="—" />
                </FormField>
              ))}
            </div>
          </Section>

          <Section title="Absentees and follow-up">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Number absent">
                  <input type="number" min="0" className="input" value={form.absenteeCount} onChange={set('absenteeCount')} placeholder="—" />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Names of absentees" hint="Separate names with commas.">
                    <input className="input" value={form.absenteeNames} onChange={set('absenteeNames')} />
                  </FormField>
                </div>
              </div>
              <FormField label="Follow-up done" hint="Calls, visits or messages made to those absent.">
                <textarea rows={3} className="input resize-y" value={form.followUpNotes} onChange={set('followUpNotes')} />
              </FormField>
            </div>
          </Section>

          <Section title="Report">
            <div className="space-y-4">
              {NARRATIVE_FIELDS.map(({ key, label, hint, required, rows }) => (
                <FormField key={key} label={label} hint={hint} required={required}>
                  <textarea rows={rows} className="input resize-y" value={form[key]} onChange={set(key)} />
                </FormField>
              ))}
            </div>
          </Section>

          <Section title="Department finances" hint="Only if your department handled money itself this period.">
            <FormField label="Offering / funds received (GHS)">
              <input type="number" min="0" step="0.01" className="input sm:w-56" value={form.offeringAmount} onChange={set('offeringAmount')} placeholder="—" />
            </FormField>
          </Section>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pb-4">
            {isEdit && (
              <button type="button" onClick={() => navigate('/hod/reports')} className="btn-outline text-sm px-5 py-2.5">
                Cancel
              </button>
            )}
            <button type="submit" disabled={saving || done || !department}
              className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50">
              {saving
                ? 'Saving…'
                : <><Send size={14} /> {isEdit ? 'Save Changes' : 'Submit Report'}</>}
            </button>
          </div>
        </form>
      </div>
    </HodLayout>
  );
}
