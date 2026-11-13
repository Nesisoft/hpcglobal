import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, HandCoins, UserPlus, Ban, RotateCcw, CheckCircle2, X, Check, Globe } from 'lucide-react';
import { adminApi } from '../../../services/api';
import { useApi } from '../../../hooks/useApi';
import AdminTable from '../AdminTable';
import AdminPagination from '../AdminPagination';
import AdminModal from '../AdminModal';
import FormField from '../FormField';
import { displayName, monthLabel, dateLabel, amountLabel } from '../../../utils/tithe';

const PAGE_SIZE = 25;
const BADGE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium font-body whitespace-nowrap';

/** How the Give page's payment methods read to the office. */
export const METHOD_LABELS = {
  MTN_MOMO:      'MTN MoMo',
  TELECEL:       'Telecel',
  AIRTELTIGO:    'AirtelTigo',
  BANK_TRANSFER: 'Bank transfer',
  CARD:          'Card',
};
export const methodLabel = (method) => METHOD_LABELS[method] ?? method ?? '';

const FILTERS = [
  ['NEEDS_MATCH', 'Needs adding'],
  ['RECORDED',    'Added'],
  ['DISMISSED',   'Dismissed'],
];

const EMPTY = {
  NEEDS_MATCH: 'Nothing waiting. Every tithe paid online is on the register.',
  RECORDED:    'No online tithes have been added to the register yet.',
  DISMISSED:   'Nothing has been dismissed.',
};

const DISMISS_REASONS = ['Not a tithe', 'Duplicate', 'Refunded'];

/**
 * Why an online tithe could not go on the register by itself, as a small
 * badge: "No number", "HPC045 not on register", "HPC045 archived" or
 * "HPC045 now on register". With no issue (an added or dismissed one may have
 * none), just the number given.
 */
export function IssueBadge({ gift }) {
  const n = gift?.titheNumber;
  switch (gift?.issue) {
    case 'NO_NUMBER':       return <span className={`${BADGE} bg-ink/5 text-ink/55`}>No number</span>;
    case 'NOT_FOUND':       return <span className={`${BADGE} bg-amber-50 text-amber-800`}>{n} not on register</span>;
    case 'ARCHIVED':        return <span className={`${BADGE} bg-ink/5 text-ink/55`}>{n} archived</span>;
    case 'NOW_ON_REGISTER': return <span className={`${BADGE} bg-green-50 text-green-700`}>{n} now on register</span>;
    default:
      return n
        ? <span className="font-mono text-xs text-ink/70">{n}</span>
        : <span className={`${BADGE} bg-ink/5 text-ink/55`}>No number</span>;
  }
}

/** "Online · MTN MoMo" on a payment that came from the Give page. */
export function OnlineChip({ online }) {
  if (!online) return null;
  const from = [online.name, online.phone].filter(Boolean).join(', ');
  return (
    <span
      className={`${BADGE} gap-1 bg-blue-50 text-blue-700`}
      title={`Paid on the website${online.paidAt ? ` on ${dateLabel(online.paidAt)}` : ''}${from ? ` by ${from}` : ''}`}
    >
      <Globe size={10} /> Online{online.method ? ` · ${methodLabel(online.method)}` : ''}
    </span>
  );
}

const titherLine = (t) => `${displayName(t)} · ${t.number}`;

/**
 * The tither one click could add this to: the person now holding the number
 * that was given, or else the only active account with the giver's phone.
 */
function quickTarget(gift) {
  if (gift.issue === 'NOW_ON_REGISTER' && gift.holder?.isActive) return gift.holder;
  const active = (gift.suggestions ?? []).filter((t) => t.isActive);
  return active.length === 1 ? active[0] : null;
}

/**
 * Admin → Tithes → Online tithes: tithes paid on the Give page that could not
 * be put on the register by themselves — no tithe number, or one that isn't an
 * active tither's. The office adds each to the right account for the month the
 * giver chose, or dismisses it.
 *
 * Props:
 *   refreshKey    – bump to reload (something changed elsewhere on the page)
 *   onChanged     – called after anything here changes an online tithe; the
 *                   page answers by bumping refreshKey, which reloads this list
 *   onAssign      – (gift, tither?) => void: open the form that adds it to the
 *                   register, with that tither already chosen when given
 *   onAddTither   – (gift) => void: add the giver as a new tither first
 *   onOpenTither  – (titherId) => void
 */
export default function OnlineTithesPanel({ refreshKey, onChanged, onAssign, onAddTither, onOpenTither }) {
  const [status, setStatus] = useState('NEEDS_MATCH');
  const [page, setPage]     = useState(1);

  const [actionError, setActionError] = useState('');
  const [restoring, setRestoring]     = useState(null);   // a gift's id
  const [dismissing, setDismissing]   = useState(null);   // the gift in the dismiss dialog

  const fetchFn = useCallback(
    () => adminApi.getOnlineTithes({ status, page, limit: PAGE_SIZE }),
    [status, page],
  );
  // refreshKey only asks for the same request to be made again.
  const { data, loading, error, refetch } = useApi(fetchFn, [status, page, refreshKey]);
  const gifts = data?.gifts ?? [];
  const total = data?.total ?? 0;
  const sum   = data?.sum ?? 0;
  // Rows stay on screen, faded, while a reload is in flight; the skeleton is
  // only for the very first load.
  const reloading = loading && Boolean(data);

  // Adding the last one on the last page would leave us on an empty page.
  useEffect(() => {
    if (loading) return;
    const lastPage = Math.max(Math.ceil(total / PAGE_SIZE), 1);
    if (page > lastPage) setPage(lastPage);
  }, [loading, total, page]);

  function changeStatus(next) {
    setStatus(next);
    setPage(1);
    setActionError('');
  }

  // The page reloads this list itself when told (via refreshKey).
  function changed() {
    if (onChanged) onChanged();
    else refetch();
  }

  async function restore(gift) {
    setRestoring(gift.id); setActionError('');
    try {
      await adminApi.restoreOnlineTithe(gift.id);
      changed();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not restore it. Please try again.');
      // Someone else got there first: show what it is now.
      if ([404, 409].includes(err.response?.status)) changed();
    } finally {
      setRestoring(null);
    }
  }

  const busy = restoring !== null;

  const columns = [
    {
      key: 'paidAt',
      label: 'Paid on',
      render: (row) => <span className="text-ink/70 text-xs whitespace-nowrap">{dateLabel(row.paidAt || row.createdAt)}</span>,
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (row) => (
        <div>
          <p className="font-display text-base text-ink whitespace-nowrap">{amountLabel(row.amount, row.currency)}</p>
          <p className="text-ink/40 text-[11px]">{methodLabel(row.method)}</p>
        </div>
      ),
    },
    {
      key: 'month',
      label: 'For',
      render: (row) => <span className="text-ink/70 text-sm whitespace-nowrap">{monthLabel(row.titheMonth)}</span>,
    },
    {
      key: 'number',
      label: 'Number given',
      render: (row) => <IssueBadge gift={row} />,
    },
    {
      key: 'giver',
      label: 'Giver',
      render: (row) => (
        <div className="min-w-0 max-w-[14rem]">
          <p className={`text-sm leading-tight truncate ${row.name ? 'text-ink/90 font-medium' : 'text-ink/40'}`}>
            {row.name || 'No name given'}
          </p>
          {row.phone && <p className="text-ink/55 text-[11px] mt-0.5">{row.phone}</p>}
          {row.email && <p className="text-ink/40 text-[11px] truncate" title={row.email}>{row.email}</p>}
        </div>
      ),
    },
    status === 'RECORDED' ? {
      key: 'register',
      label: 'On the register',
      render: (row) => (row.payment?.tither ? (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onOpenTither(row.payment.tither.id)}
            className="text-sm text-ink/90 font-medium text-left hover:text-purple-brand hover:underline"
          >
            {titherLine(row.payment.tither)}
          </button>
          <p className="text-ink/40 text-[11px] mt-0.5 flex items-center gap-1.5">
            for {monthLabel(row.payment.month)}
            {!row.payment.tither.isActive && <span className={`${BADGE} bg-ink/5 text-ink/50`}>Archived</span>}
          </p>
        </div>
      ) : <span className="text-ink/35 text-xs">—</span>),
    } : status === 'DISMISSED' ? {
      key: 'reason',
      label: 'Why',
      render: (row) => (
        <div className="min-w-0 max-w-[16rem] whitespace-normal">
          <p className="text-sm text-ink/80 leading-snug break-words">{row.titheNote || '—'}</p>
          {row.titheReviewedBy && <p className="text-ink/40 text-[11px] mt-0.5">Dismissed by {row.titheReviewedBy}</p>}
        </div>
      ),
    } : {
      key: 'suggestion',
      label: 'Suggestion',
      render: (row) => <Suggestions gift={row} />,
    },
    {
      key: '_actions',
      label: '',
      // Decided by the row itself, not the filter: while a new filter loads,
      // the previous rows are still on screen and must not offer the wrong action.
      render: (row) => {
        if (row.titheStatus === 'DISMISSED') {
          return (
            <button
              type="button"
              onClick={() => restore(row)}
              disabled={busy}
              className="btn-outline text-[11px] px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
              title="Put it back on the list of online tithes to add"
            >
              {restoring === row.id ? 'Restoring…' : <><RotateCcw size={11} /> Restore</>}
            </button>
          );
        }
        if (row.titheStatus !== 'NEEDS_MATCH') return null;
        const quick = quickTarget(row);
        return (
          <div className="flex flex-wrap items-center gap-1.5 max-w-[17rem]">
            {quick && (
              <button
                type="button"
                onClick={() => onAssign(row, quick)}
                disabled={busy}
                className="btn-primary text-[11px] px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
                title={`Add it to ${titherLine(quick)}`}
              >
                <Check size={11} /> Add to {quick.number}
              </button>
            )}
            <button
              type="button"
              onClick={() => onAssign(row)}
              disabled={busy}
              className={`${quick ? 'btn-outline' : 'btn-primary'} text-[11px] px-3 py-1.5 whitespace-nowrap disabled:opacity-50`}
              title="Choose the tither to add it to"
            >
              <HandCoins size={11} /> Add to register
            </button>
            <button
              type="button"
              onClick={() => onAddTither(row)}
              disabled={busy}
              className="btn-outline text-[11px] px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
              title="Put the giver on the register, then add this tithe"
            >
              <UserPlus size={11} /> New tither
            </button>
            <button
              type="button"
              onClick={() => { setActionError(''); setDismissing(row); }}
              disabled={busy}
              className="text-[11px] px-2 py-1.5 whitespace-nowrap text-ink/45 hover:text-red-600 font-body inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Ban size={11} /> Dismiss
            </button>
          </div>
        );
      },
    },
  ];

  function summaryLine() {
    const what = `${total} online tithe${total === 1 ? '' : 's'}`;
    if (status === 'NEEDS_MATCH') return `${what} waiting to be added`;
    if (status === 'RECORDED') return `${what} added to the register`;
    return `${what} dismissed`;
  }

  return (
    <div>
      <p className="text-xs text-ink/55 font-body mb-4 max-w-3xl">
        Tithes paid on the website go on the register by themselves when the tithe number belongs to an active tither.
        The rest wait here — with no number, or a number that isn't on the register. Add each one to the right tither
        for the month the giver chose, or dismiss it.
      </p>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-purple-brand/15 overflow-hidden text-xs font-body">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => changeStatus(value)}
              className={`px-4 py-2 transition-colors ${
                status === value ? 'bg-purple-brand text-white' : 'bg-white text-ink/55 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body flex items-start justify-between gap-3 mb-4">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="flex-shrink-0 text-red-400 hover:text-red-600" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body flex items-center justify-between gap-3">
          <span>Could not load the online tithes: {error}</span>
          <button type="button" onClick={refetch} className="underline flex-shrink-0 inline-flex items-center gap-1">
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : (
        <>
          {data && total > 0 && (
            <p className={`text-xs text-ink/50 font-body mb-3 transition-opacity ${reloading ? 'opacity-50' : ''}`}>
              {summaryLine()} · <span className="text-ink/80 font-medium">{amountLabel(sum)}</span>
            </p>
          )}

          {data && gifts.length === 0 ? (
            <div className={`bg-white rounded-xl border border-purple-brand/8 py-14 px-6 text-center transition-opacity ${reloading ? 'opacity-60' : ''}`}>
              {status === 'NEEDS_MATCH' && (
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                  <CheckCircle2 size={20} />
                </div>
              )}
              <p className="text-ink/45 font-body text-sm">{EMPTY[status]}</p>
            </div>
          ) : (
            <div className={`transition-opacity ${reloading ? 'opacity-60' : ''}`}>
              <AdminTable columns={columns} rows={gifts} loading={loading && !data} />
              <AdminPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onChange={setPage}
                noun="online tithes"
              />
            </div>
          )}
        </>
      )}

      <DismissModal
        gift={dismissing}
        onClose={() => setDismissing(null)}
        onDismissed={() => { setDismissing(null); changed(); }}
        onStale={changed}
      />
    </div>
  );
}

/** Who this might be: the holder of the number given, and accounts with the giver's phone. */
function Suggestions({ gift }) {
  const lines = [];
  if (gift.holder && gift.issue === 'NOW_ON_REGISTER') {
    lines.push({ key: `h${gift.holder.id}`, label: 'Number now belongs to', tither: gift.holder });
  } else if (gift.holder && gift.issue === 'ARCHIVED') {
    lines.push({ key: `h${gift.holder.id}`, label: 'Number belongs to', tither: gift.holder });
  }
  for (const t of gift.suggestions ?? []) {
    if (lines.some((l) => l.tither.id === t.id)) continue;
    lines.push({ key: `s${t.id}`, label: 'Same phone', tither: t });
  }
  if (!lines.length) return <span className="text-ink/35 text-xs">No match found</span>;
  return (
    <div className="space-y-1 max-w-[18rem] whitespace-normal">
      {lines.map(({ key, label, tither }) => (
        <p key={key} className="text-xs text-ink/70 leading-snug">
          <span className="text-ink/45">{label}:</span> {titherLine(tither)}
          {!tither.isActive && <span className={`${BADGE} bg-ink/5 text-ink/50 ml-1.5`}>Archived</span>}
        </p>
      ))}
    </div>
  );
}

/** Take an online tithe off the to-add list, with the reason kept. */
function DismissModal({ gift, onClose, onDismissed, onStale }) {
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (!gift) return;
    setNote(''); setError(''); setSaving(false);
  }, [gift]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    const reason = note.trim();
    if (!reason) { setError('Please say why it is being dismissed.'); return; }
    setSaving(true); setError('');
    try {
      await adminApi.dismissOnlineTithe(gift.id, reason);
      onDismissed();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not dismiss it. Please try again.');
      // Already added or dismissed by someone else: refresh the list behind.
      if ([404, 409].includes(err.response?.status)) onStale?.();
    } finally {
      setSaving(false);
    }
  }

  const who = gift?.name || gift?.phone || 'the giver';

  return (
    <AdminModal open={Boolean(gift)} onClose={onClose} title="Dismiss this online tithe?" size="md" dismissable={!saving}>
      {gift && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <p className="text-sm font-body text-ink/70 leading-relaxed">
            {amountLabel(gift.amount, gift.currency)} from {who}, paid {dateLabel(gift.paidAt || gift.createdAt)}, stays on
            the Giving page — it just won't be added to the tithe register. You can restore it later from Dismissed.
          </p>

          <FormField label="Why" required error={error && !note.trim() ? error : undefined}>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {DISMISS_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => { setNote(reason); setError(''); }}
                  aria-pressed={note.trim() === reason}
                  className={`px-3 py-1 rounded-full text-xs font-body border transition-colors ${
                    note.trim() === reason
                      ? 'bg-purple-brand text-white border-purple-brand'
                      : 'bg-white text-ink/60 border-purple-brand/15 hover:text-ink'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <input
              className="input"
              value={note}
              onChange={(e) => { setNote(e.target.value); setError(''); }}
              placeholder="Or type the reason"
              maxLength={300}
              autoFocus
            />
          </FormField>

          {error && note.trim() && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-purple-brand/8">
            <button type="button" onClick={onClose} disabled={saving} className="btn-outline text-sm px-5 py-2 disabled:opacity-50">
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
              {saving ? 'Dismissing…' : <><Ban size={14} /> Dismiss</>}
            </button>
          </div>
        </form>
      )}
    </AdminModal>
  );
}
