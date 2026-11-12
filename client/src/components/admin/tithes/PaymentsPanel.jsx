import { useState, useCallback, useEffect } from 'react';
import { Download, Pencil, Trash2, Send, Plus, RefreshCw, CheckCircle2, AlertTriangle, MinusCircle, X } from 'lucide-react';
import { adminApi } from '../../../services/api';
import { useApi } from '../../../hooks/useApi';
import AdminTable from '../AdminTable';
import AdminPagination from '../AdminPagination';
import ConfirmDialog from '../ConfirmDialog';
import MonthPicker from './MonthPicker';
import SmsStatusBadge from './SmsStatusBadge';
import PaymentEditModal from './PaymentEditModal';
import { displayName, monthLabel, dateLabel, amountLabel, thisMonth, todayYmd } from '../../../utils/tithe';
import { downloadBlob } from '../../../utils/download';

const PAGE_SIZE = 25;

const SMS_FILTERS = [
  ['',        'All SMS statuses'],
  ['SENT',    'Sent'],
  ['FAILED',  'Failed'],
  ['SKIPPED', 'No SMS'],
];
const SMS_FILTER_EMPTY = { SENT: 'with an SMS sent', FAILED: 'with a failed SMS', SKIPPED: 'without an SMS' };

const OUTCOME = {
  SENT:    { Icon: CheckCircle2,  className: 'text-green-700' },
  SKIPPED: { Icon: MinusCircle,   className: 'text-ink/45' },
  FAILED:  { Icon: AlertTriangle, className: 'text-red-600' },
};

/** The server's message when it sent one. A blob request wraps it in a Blob. */
async function serverMessage(err, fallback) {
  const data = err.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).message || fallback; } catch { return fallback; }
  }
  return data?.message || fallback;
}

/** What just happened when "Send SMS" was pressed, shown under the badge. */
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
 * Admin → Tithes → Payments: every tithe recorded, newest first, with the
 * acknowledgement SMS that went (or didn't) for each one.
 *
 * Props:
 *   refreshKey       – bump to reload (a payment was recorded elsewhere on the page)
 *   onChanged        – called after anything here changes a payment; the page
 *                      answers by bumping refreshKey, which reloads this list
 *   onOpenTither     – (titherId) => void
 *   onRecordPayment  – () => void
 */
export default function PaymentsPanel({ refreshKey, onChanged, onOpenTither, onRecordPayment }) {
  const [month, setMonth] = useState(thisMonth);
  const [sms, setSms]     = useState('');
  const [page, setPage]   = useState(1);

  const [exporting, setExporting]       = useState(false);
  const [actionError, setActionError]   = useState('');
  const [resending, setResending]       = useState(null);   // a payment's id
  const [smsResult, setSmsResult]       = useState(null);   // { id, status, to, error }
  const [editing, setEditing]           = useState(null);   // the payment in PaymentEditModal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);

  const fetchFn = useCallback(
    () => adminApi.getTithePayments({ month: month || undefined, sms: sms || undefined, page, limit: PAGE_SIZE }),
    [month, sms, page],
  );
  // refreshKey is in the hook's deps but not fetchFn's: it changes nothing in
  // the request, it only asks for it to be made again.
  const { data, loading, error, refetch } = useApi(fetchFn, [month, sms, page, refreshKey]);
  const payments  = data?.payments ?? [];
  // Rows stay on screen, faded, while a reload is in flight; the skeleton is
  // only for the very first load.
  const reloading = loading && Boolean(data);
  const total    = data?.total ?? 0;
  const sum      = data?.sum ?? 0;

  // Deleting the last payment on the last page would leave us on an empty one.
  useEffect(() => {
    if (loading) return;
    const lastPage = Math.max(Math.ceil(total / PAGE_SIZE), 1);
    if (page > lastPage) setPage(lastPage);
  }, [loading, total, page]);

  // Any filter change invalidates the current offset.
  function changeMonth(value) { setMonth(value); setPage(1); }
  function changeSms(e)       { setSms(e.target.value); setPage(1); }

  // The page reloads this list itself when told (via refreshKey); doing it
  // here as well would fetch the same page twice.
  function changed() {
    if (onChanged) onChanged();
    else refetch();
  }

  async function handleExport() {
    setExporting(true); setActionError('');
    try {
      const { data: blob } = await adminApi.exportTithePayments({ month: month || undefined, sms: sms || undefined });
      downloadBlob(blob, `tithes-${month || todayYmd()}.csv`);
    } catch (err) {
      setActionError(await serverMessage(err, 'Export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  }

  async function resend(row) {
    setResending(row.id); setSmsResult(null);
    try {
      const { data: res } = await adminApi.resendTitheSms(row.id);
      setSmsResult({ id: row.id, ...res.sms });
      changed();
    } catch (err) {
      setSmsResult({ id: row.id, status: 'ERROR', error: await serverMessage(err, 'Could not send the SMS. Please try again.') });
    } finally {
      setResending(null);
    }
  }

  async function handleDelete() {
    setDeleting(true); setActionError('');
    try {
      await adminApi.deleteTithePayment(deleteTarget.id);
      setDeleteTarget(null);
      changed();
    } catch (err) {
      setDeleteTarget(null);
      setActionError(await serverMessage(err, 'Could not delete that payment. Please try again.'));
      if (err.response?.status === 404) changed();   // it had already gone
    } finally {
      setDeleting(false);
    }
  }

  function emptyMessage() {
    const when = month ? ` for ${monthLabel(month)}` : '';
    if (sms) return `No payments ${SMS_FILTER_EMPTY[sms]}${when}.`;
    return month ? `No tithe payments recorded${when}.` : 'No tithe payments recorded yet.';
  }

  const columns = [
    {
      key: 'paidOn',
      label: 'Paid on',
      render: (row) => <span className="text-ink/70 text-xs">{dateLabel(row.paidOn)}</span>,
    },
    {
      key: 'tither',
      label: 'Tither',
      render: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onOpenTither(row.tither.id)}
            className="font-medium text-ink/90 text-sm leading-tight text-left hover:text-purple-brand hover:underline"
          >
            {displayName(row.tither)}
          </button>
          <p className="text-ink/40 text-[11px] font-mono mt-0.5 flex items-center gap-1.5">
            {row.tither.number}
            {!row.tither.isActive && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium font-body bg-ink/5 text-ink/50">
                Archived
              </span>
            )}
          </p>
        </div>
      ),
    },
    {
      key: 'month',
      label: 'For',
      render: (row) => <span className="text-ink/70 text-sm">{monthLabel(row.month)}</span>,
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (row) => <span className="font-display text-base text-ink">{amountLabel(row.amount, row.currency)}</span>,
    },
    {
      key: 'sms',
      label: 'SMS',
      render: (row) => {
        const result  = smsResult?.id === row.id ? smsResult : null;
        // Anything short of a sent SMS — failed, skipped or never tried.
        const canSend = row.smsStatus !== 'SENT';
        return (
          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <SmsStatusBadge status={row.smsStatus} error={row.smsError} to={row.smsTo} detail />
              {canSend && (
                <button
                  type="button"
                  onClick={() => resend(row)}
                  disabled={resending !== null}
                  className="btn-outline text-[11px] px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  {resending === row.id ? 'Sending…' : <><Send size={11} /> Send SMS</>}
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
            <p className="text-ink/40 text-[11px] mt-0.5 max-w-[16rem] truncate" title={row.note}>{row.note}</p>
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
            onClick={() => setEditing(row)}
            className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(row)}
            className="p-1.5 text-ink/30 hover:text-red-500 rounded transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* The list is by the month a tithe is for, not the day it was paid. */}
        <div role="group" aria-label="Tithes for" className="flex items-center gap-2">
          <span aria-hidden="true" className="text-xs text-ink/50 font-body whitespace-nowrap">Tithes for</span>
          <MonthPicker value={month} onChange={changeMonth} allowAll />
        </div>
        <select className="input py-2 text-sm w-40" value={sms} onChange={changeSms} aria-label="SMS status">
          {SMS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || total === 0}
          className="btn-outline text-sm px-4 py-2 sm:ml-auto disabled:opacity-50"
        >
          <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body flex items-start justify-between gap-3 mb-4">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError('')}
            className="flex-shrink-0 text-red-400 hover:text-red-600"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body flex items-center justify-between gap-3">
          <span>Could not load payments: {error}</span>
          <button type="button" onClick={refetch} className="underline flex-shrink-0 inline-flex items-center gap-1">
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : (
        <>
          {data && (
            <p className={`text-xs text-ink/50 font-body mb-3 transition-opacity ${reloading ? 'opacity-50' : ''}`}>
              {total} payment{total !== 1 ? 's' : ''} · <span className="text-ink/80 font-medium">{amountLabel(sum)}</span>
              {month && ` for ${monthLabel(month)}`}
            </p>
          )}

          {data && payments.length === 0 ? (
            <div className={`bg-white rounded-xl border border-purple-brand/8 py-14 px-6 text-center transition-opacity ${reloading ? 'opacity-60' : ''}`}>
              <p className="text-ink/45 font-body text-sm">{emptyMessage()}</p>
              <button type="button" onClick={onRecordPayment} className="btn-primary text-sm px-5 py-2 mt-4">
                <Plus size={14} /> Record a payment
              </button>
            </div>
          ) : (
            <div className={`transition-opacity ${reloading ? 'opacity-60' : ''}`}>
              <AdminTable columns={columns} rows={payments} loading={loading && !data} />
              <AdminPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onChange={setPage}
                noun="payments"
              />
            </div>
          )}
        </>
      )}

      {editing && (
        <PaymentEditModal
          payment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); changed(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete this payment?"
        message={deleteTarget
          ? `${amountLabel(deleteTarget.amount, deleteTarget.currency)} from ${displayName(deleteTarget.tither)} for ${monthLabel(deleteTarget.month)} will be removed from the records. This cannot be undone.`
          : ''}
        danger
      />
    </div>
  );
}
