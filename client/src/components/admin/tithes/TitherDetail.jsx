import { useState, useCallback } from 'react';
import {
  Phone, Pencil, Trash2, Send, HandCoins, Users, Archive, ArchiveRestore, RefreshCw,
  CheckCircle2, AlertTriangle, MinusCircle, X,
} from 'lucide-react';
import { adminApi } from '../../../services/api';
import { useApi } from '../../../hooks/useApi';
import AdminModal from '../AdminModal';
import AdminTable from '../AdminTable';
import ConfirmDialog from '../ConfirmDialog';
import Spinner from '../../ui/Spinner';
import SmsStatusBadge from './SmsStatusBadge';
import PaymentEditModal from './PaymentEditModal';
import { displayName, formatPhone, monthLabel, dateLabel, amountLabel } from '../../../utils/tithe';

const OUTCOME = {
  SENT:    { Icon: CheckCircle2,  className: 'text-green-700' },
  SKIPPED: { Icon: MinusCircle,   className: 'text-ink/45' },
  FAILED:  { Icon: AlertTriangle, className: 'text-red-600' },
};

const Badge = ({ children, className }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium font-body ${className}`}>
    {children}
  </span>
);

function Stat({ label, value, sub }) {
  return (
    <div className="bg-cream/60 rounded-lg px-4 py-3">
      <p className="text-ink/45 text-[11px] font-body uppercase tracking-wider">{label}</p>
      <p className="font-display text-lg text-ink font-light leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-ink/40 text-[11px] font-body mt-0.5">{sub}</p>}
    </div>
  );
}

/** What just happened when an SMS was sent from this view. */
function SmsOutcome({ status, to, error }) {
  const { Icon, className } = OUTCOME[status] ?? OUTCOME.FAILED;
  // `to` is everyone who now has the text — on a resend that finished a
  // couple's partly failed send, that includes the phone texted earlier.
  const reached = to?.length ? `${to.join(' and ')} ${to.length > 1 ? 'have' : 'has'} the text.` : '';
  // A failed send can still have reached one of a couple's phones.
  const text = status === 'SENT' ? (reached ? `Sent. ${reached}` : 'Sent.')
    : status === 'FAILED' && reached ? `${reached} ${error ?? ''}`.trim()
    : status === 'ERROR' ? error
    : `Just now: ${error || 'not sent.'}`;
  return (
    <p className={`flex items-start gap-1 text-[11px] leading-snug mt-1 max-w-xs whitespace-normal ${className}`}>
      <Icon size={11} className="mt-px flex-shrink-0" /> <span>{text}</span>
    </p>
  );
}

/**
 * One tither's account: who they are, what they have given, and every
 * acknowledgement SMS. Opened from a row on the Tithers or Payments tab.
 *
 * Props:
 *   titherId         – open while truthy
 *   onClose
 *   onEdit           – (tither) => void
 *   onConvert        – (tither) => void   (individual → couple)
 *   onRecordPayment  – (tither) => void
 *   onChanged        – called after anything here changes the account or a payment
 *   refreshKey       – optional; the page bumps it when something changed elsewhere
 */
export default function TitherDetail({ titherId, onClose, onEdit, onConvert, onRecordPayment, onChanged, refreshKey }) {
  // Nothing to fetch while closed; the modal is hidden then anyway.
  const fetchFn = useCallback(
    () => (titherId ? adminApi.getTither(titherId) : Promise.resolve({ data: null })),
    [titherId],
  );
  const { data: tither, loading, error, refetch } = useApi(fetchFn, [titherId, refreshKey]);

  const [actionError, setActionError] = useState('');
  const [busy, setBusy]               = useState('');     // 'archive' | 'delete' | 'delete-payment' | a payment id being resent
  const [smsResult, setSmsResult]     = useState(null);   // { id, status, to, error }
  const [editing, setEditing]         = useState(null);   // the payment in PaymentEditModal (with its tither attached)
  const [confirm, setConfirm]         = useState(null);   // 'archive' | 'delete' | { payment } | { resend }

  // A page that passes refreshKey bumps it in answer to onChanged, which
  // reloads this view along with the totals and lists behind it — reloading
  // here too would only fetch the same thing twice. Without it, reload here.
  function changed() {
    if (refreshKey === undefined) refetch();
    onChanged?.();
  }

  const serverMessage = (err, fallback) => err.response?.data?.message || fallback;

  // The edit modal shows who the payment belongs to; the detail's payment
  // rows don't carry that, so it is added from the account itself. Built once
  // here so the modal's form isn't reset by this view re-rendering.
  function openEdit(payment) {
    setEditing({
      ...payment,
      tither: { id: tither.id, number: tither.number, name: tither.name, type: tither.type, spouseName: tither.spouseName, isActive: tither.isActive },
    });
  }

  async function toggleArchived() {
    setBusy('archive'); setActionError('');
    try {
      // Only the archived flag: resending the whole account could undo an
      // edit made elsewhere since this view loaded.
      await adminApi.setTitherActive(tither.id, !tither.isActive);
      setConfirm(null);
      changed();
    } catch (err) {
      setConfirm(null);
      setActionError(serverMessage(err, 'Could not update the account. Please try again.'));
    } finally {
      setBusy('');
    }
  }

  async function deleteTither() {
    setBusy('delete'); setActionError('');
    try {
      await adminApi.deleteTither(tither.id);
      setConfirm(null);
      onChanged?.();
      onClose();
    } catch (err) {
      setConfirm(null);
      // 409: it has payments after all — the message says to archive instead.
      setActionError(serverMessage(err, 'Could not delete the account. Please try again.'));
      if (err.response?.status === 409) refetch();
    } finally {
      setBusy('');
    }
  }

  async function resend(payment) {
    setBusy(payment.id); setSmsResult(null); setActionError('');
    try {
      const { data: res } = await adminApi.resendTitheSms(payment.id);
      setSmsResult({ id: payment.id, ...res.sms });
      changed();
    } catch (err) {
      setSmsResult({ id: payment.id, status: 'ERROR', error: serverMessage(err, 'Could not send the SMS. Please try again.') });
    } finally {
      setBusy('');
    }
  }

  // An acknowledgement that already went out is only sent again on purpose.
  async function confirmResend() {
    const payment = confirm?.resend;
    if (!payment) return;
    await resend(payment);
    setConfirm(null);
  }

  async function deletePayment() {
    const payment = confirm?.payment;
    if (!payment) return;
    setBusy('delete-payment'); setActionError('');
    try {
      await adminApi.deleteTithePayment(payment.id);
      setConfirm(null);
      changed();
    } catch (err) {
      setConfirm(null);
      setActionError(serverMessage(err, 'Could not delete that payment. Please try again.'));
      if (err.response?.status === 404) changed();   // it had already gone
    } finally {
      setBusy('');
    }
  }

  const payments = tither?.payments ?? [];
  const stats    = tither?.stats ?? { total: 0, count: 0, yearTotal: 0, yearCount: 0 };
  const last     = payments[0] ?? null;
  const couple   = tither?.type === 'COUPLE';
  const phones   = tither
    ? [
        { who: tither.name,       value: tither.phone },
        ...(couple ? [{ who: tither.spouseName, value: tither.spousePhone }] : []),
      ]
    : [];
  const hasPhone = phones.some((p) => p.value);

  const columns = [
    {
      key: 'paidOn',
      label: 'Paid on',
      render: (row) => <span className="text-ink/70 text-xs whitespace-nowrap">{dateLabel(row.paidOn)}</span>,
    },
    {
      key: 'month',
      label: 'For',
      render: (row) => <span className="text-ink/70 text-sm whitespace-nowrap">{monthLabel(row.month)}</span>,
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (row) => <span className="font-display text-base text-ink whitespace-nowrap">{amountLabel(row.amount, row.currency)}</span>,
    },
    {
      key: 'sms',
      label: 'SMS',
      render: (row) => {
        const result  = smsResult?.id === row.id ? smsResult : null;
        const sent    = row.smsStatus === 'SENT';
        const sending = busy === row.id;
        return (
          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <SmsStatusBadge status={row.smsStatus} error={row.smsError} to={row.smsTo} detail />
              {hasPhone && (
                <button
                  type="button"
                  onClick={() => (sent ? setConfirm({ resend: row }) : resend(row))}
                  disabled={Boolean(busy)}
                  className="btn-outline text-[11px] px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
                  title={sent ? 'Send the acknowledgement again' : 'Send the acknowledgement SMS'}
                >
                  {sending ? 'Sending…' : sent ? <><RefreshCw size={11} /> Resend</> : <><Send size={11} /> Send SMS</>}
                </button>
              )}
            </div>
            {result && <SmsOutcome status={result.status} to={result.to} error={result.error} />}
          </div>
        );
      },
    },
    {
      key: 'recordedBy',
      label: 'Recorded by',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-ink/60 text-xs">{row.recordedBy || '—'}</p>
          {row.note && (
            <p className="text-ink/40 text-[11px] mt-0.5 max-w-[14rem] truncate" title={row.note}>{row.note}</p>
          )}
        </div>
      ),
    },
    {
      key: '_actions',
      label: '',
      width: '80px',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openEdit(row)}
            disabled={Boolean(busy)}
            className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors disabled:opacity-50"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => setConfirm({ payment: row })}
            disabled={Boolean(busy)}
            className="p-1.5 text-ink/30 hover:text-red-500 rounded transition-colors disabled:opacity-50"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminModal open={Boolean(titherId)} onClose={onClose} title="Tither" size="xl">
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body flex items-center justify-between gap-3">
          <span>Could not load this tither: {error}</span>
          <button type="button" onClick={refetch} className="underline flex-shrink-0 inline-flex items-center gap-1">
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : !tither ? (
        <Spinner />
      ) : (
        // Kept on screen, slightly faded, while a reload is in flight.
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Who */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-display text-xl text-ink font-light leading-tight">{displayName(tither)}</h4>
                {couple && <Badge className="bg-purple-brand/10 text-purple-brand">Couple</Badge>}
                {!tither.isActive && <Badge className="bg-ink/5 text-ink/50">Archived</Badge>}
              </div>
              <p className="font-mono text-xs text-ink/50 mt-1">{tither.number}</p>

              <div className="mt-3 space-y-1">
                {phones.map((p, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-sm font-body text-ink/70">
                    <Phone size={13} className="text-ink/35 flex-shrink-0" />
                    {p.value
                      ? <span>{formatPhone(p.value)}{couple && <span className="text-ink/40 text-xs"> · {p.who}</span>}</span>
                      : <span className="text-ink/40">No phone{couple ? ` for ${p.who}` : ''} — no SMS can be sent</span>}
                  </p>
                ))}
              </div>

              {tither.notes && (
                <p className="mt-3 text-xs font-body text-ink/55 whitespace-pre-line max-w-prose">{tither.notes}</p>
              )}
              <p className="mt-3 text-[11px] font-body text-ink/40">On the register since {dateLabel(tither.createdAt)}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 sm:justify-end sm:max-w-[18rem]">
              {tither.isActive && (
                <button type="button" onClick={() => onRecordPayment(tither)} className="btn-primary text-xs px-4 py-2 whitespace-nowrap">
                  <HandCoins size={13} /> Record payment
                </button>
              )}
              <button type="button" onClick={() => onEdit(tither)} className="btn-outline text-xs px-4 py-2 whitespace-nowrap">
                <Pencil size={13} /> Edit
              </button>
              {tither.type === 'INDIVIDUAL' && (
                <button type="button" onClick={() => onConvert(tither)} className="btn-outline text-xs px-4 py-2 whitespace-nowrap">
                  <Users size={13} /> Convert to couple
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirm('archive')}
                disabled={Boolean(busy)}
                className="btn-outline text-xs px-4 py-2 whitespace-nowrap disabled:opacity-50"
              >
                {tither.isActive ? <><Archive size={13} /> Archive</> : <><ArchiveRestore size={13} /> Restore</>}
              </button>
              {payments.length === 0 && (
                <button
                  type="button"
                  onClick={() => setConfirm('delete')}
                  disabled={Boolean(busy)}
                  className="btn-outline text-xs px-4 py-2 whitespace-nowrap text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <Stat
              label="This year"
              value={amountLabel(stats.yearTotal)}
              sub={`${stats.yearCount} payment${stats.yearCount === 1 ? '' : 's'}`}
            />
            <Stat
              label="All time"
              value={amountLabel(stats.total)}
              sub={`${stats.count} payment${stats.count === 1 ? '' : 's'}`}
            />
            <Stat
              label="Last payment"
              value={last ? dateLabel(last.paidOn) : 'None yet'}
              sub={last ? `${amountLabel(last.amount, last.currency)} for ${monthLabel(last.month)}` : ''}
            />
          </div>

          {actionError && (
            <div className="mt-5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body flex items-start justify-between gap-3">
              <span>{actionError}</span>
              <button type="button" onClick={() => setActionError('')} className="flex-shrink-0 text-red-400 hover:text-red-600" aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Payments */}
          <div className="mt-6">
            <p className="text-xs text-ink/50 font-body mb-2">
              {payments.length} payment{payments.length === 1 ? '' : 's'}
            </p>
            <AdminTable
              columns={columns}
              rows={payments}
              empty={tither.isActive ? 'No payments recorded yet.' : 'No payments were recorded for this account.'}
            />
          </div>
        </div>
      )}

      {editing && (
        <PaymentEditModal
          payment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); changed(); }}
        />
      )}

      <ConfirmDialog
        open={confirm === 'archive'}
        onClose={() => setConfirm(null)}
        onConfirm={toggleArchived}
        loading={busy === 'archive'}
        danger={false}
        title={tither?.isActive ? 'Archive this account?' : 'Restore this account?'}
        message={tither?.isActive
          ? `${displayName(tither)} keeps the number ${tither.number} and every payment on record, but no new payments can be recorded until the account is restored.`
          : `${displayName(tither)} will be back on the active register and payments can be recorded again.`}
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={deleteTither}
        loading={busy === 'delete'}
        title="Delete this account?"
        message={tither ? `${displayName(tither)} (${tither.number}) will be removed from the register. This cannot be undone.` : ''}
        danger
      />

      <ConfirmDialog
        open={Boolean(confirm?.resend)}
        onClose={() => setConfirm(null)}
        onConfirm={confirmResend}
        loading={Boolean(confirm?.resend) && busy === confirm.resend.id}
        danger={false}
        title="Send the acknowledgement again?"
        message={tither ? `${displayName(tither)} will get the same text a second time.` : ''}
      />

      <ConfirmDialog
        open={Boolean(confirm?.payment)}
        onClose={() => setConfirm(null)}
        onConfirm={deletePayment}
        loading={busy === 'delete-payment'}
        title="Delete this payment?"
        message={confirm?.payment
          ? `${amountLabel(confirm.payment.amount, confirm.payment.currency)} for ${monthLabel(confirm.payment.month)}, paid on ${dateLabel(confirm.payment.paidOn)}, will be removed from the records. This cannot be undone.`
          : ''}
        danger
      />
    </AdminModal>
  );
}
