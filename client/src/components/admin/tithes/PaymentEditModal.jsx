import { useState, useEffect } from 'react';
import { X, Check, Info } from 'lucide-react';
import { adminApi } from '../../../services/api';
import AdminModal from '../AdminModal';
import FormField from '../FormField';
import MonthPicker from './MonthPicker';
import { displayName, todayYmd } from '../../../utils/tithe';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;

const fromPayment = (p) => ({
  amount: p?.amount == null ? '' : String(p.amount),
  month:  p?.month ?? '',
  paidOn: String(p?.paidOn ?? '').slice(0, 10),
  note:   p?.note ?? '',
});

/** The first thing wrong with each field, worded like the server's own checks. */
function check(form, initial) {
  const problems = {};
  const amount = Number(form.amount);
  if (form.amount === '' || Number.isNaN(amount)) problems.amount = 'Please enter the amount';
  else if (amount <= 0) problems.amount = 'The amount must be more than zero';
  if (!MONTH_RE.test(form.month)) problems.month = 'Please choose the month the tithe is for';
  if (!DATE_RE.test(form.paidOn)) problems.paidOn = 'Please choose the date it was paid';
  // The server allows a day's slack for offices a timezone ahead, so a date
  // it already accepted is not questioned again when only the note changes.
  else if (form.paidOn !== initial.paidOn && form.paidOn > todayYmd()) problems.paidOn = 'That date is in the future';
  return problems;
}

/**
 * Edit the amount, month, date or note of a recorded tithe payment. Who it
 * was from cannot change here — delete it and record it again for that.
 *
 * Props:
 *   payment  – the payment (P from the API); the modal is open while truthy
 *   onClose  – close handler
 *   onSaved  – (payment) => void, with the server's updated row
 */
export default function PaymentEditModal({ payment, onClose, onSaved }) {
  const [form, setForm]         = useState(() => fromPayment(payment));
  const [problems, setProblems] = useState({});
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // Refill when a different payment is opened. The parent keeps the same
  // object while one is being edited, so typing is never overwritten.
  useEffect(() => {
    setForm(fromPayment(payment));
    setProblems({});
    setError('');
  }, [payment]);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
    // A corrected field drops its message straight away.
    setProblems((p) => {
      const next = { ...p };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  }

  const initial = fromPayment(payment);
  const dirty   = Object.keys(initial).some((key) => form[key] !== initial[key]);

  async function handleSave(e) {
    e.preventDefault();
    const found = check(form, initial);
    if (Object.keys(found).length) { setProblems(found); return; }

    setSaving(true);
    setError('');
    try {
      const { data } = await adminApi.updateTithePayment(payment.id, {
        amount: Number(form.amount),
        month:  form.month,
        paidOn: form.paidOn,
        note:   form.note.trim(),
      });
      onSaved?.(data.payment);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not save the changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const tither = payment?.tither;

  return (
    // Held open while saving, so a late answer can't land after it was closed.
    <AdminModal open={!!payment} onClose={onClose} title="Edit payment" size="md" dismissable={!saving}>
      {payment && (
        <form onSubmit={handleSave} noValidate className="space-y-4">
          <div className="rounded-lg bg-cream/40 border border-purple-brand/8 px-4 py-3">
            <p className="text-[11px] font-body font-semibold uppercase tracking-wider text-ink/50">Tither</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-body text-ink/90">
              <span className="font-mono text-xs text-ink/60">{tither?.number}</span>
              <span className="font-medium">{displayName(tither)}</span>
              {tither?.type === 'COUPLE' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-brand/10 text-purple-brand">
                  Couple
                </span>
              )}
              {tither && !tither.isActive && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink/5 text-ink/50">
                  Archived
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Amount" required error={problems.amount}>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-body text-ink/40 pointer-events-none">
                  GHS
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  className="input pl-14"
                  autoFocus
                  value={form.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </FormField>
            <FormField label="Date paid" required error={problems.paidOn}>
              <input
                type="date"
                className="input"
                value={form.paidOn}
                max={todayYmd()}
                onChange={(e) => set({ paidOn: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Month the tithe is for" required error={problems.month}>
            <MonthPicker value={form.month} onChange={(month) => set({ month })} />
          </FormField>

          <FormField label="Note" hint="Optional — internal only">
            <input
              className="input"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              maxLength={300}
              placeholder="e.g. Paid by mobile money"
            />
          </FormField>

          <p className="flex items-start gap-2 text-[11px] font-body text-ink/50">
            <Info size={13} className="flex-shrink-0 mt-px text-ink/40" />
            Editing does not send another SMS — use Send SMS on the payment if the person should be told.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-purple-brand/8">
            <button type="button" onClick={onClose} disabled={saving} className="btn-outline text-sm px-5 py-2 disabled:opacity-50">
              <X size={14} /> Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !dirty}
              className="btn-primary text-sm px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : <><Check size={14} /> Save changes</>}
            </button>
          </div>
        </form>
      )}
    </AdminModal>
  );
}
