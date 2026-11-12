import { useState, useEffect, useCallback } from 'react';
import { Search, X, UserPlus, Upload, RefreshCw, Coins, Archive } from 'lucide-react';
import { adminApi } from '../../../services/api';
import { useApi } from '../../../hooks/useApi';
import AdminTable from '../AdminTable';
import AdminPagination from '../AdminPagination';
import MonthPicker from './MonthPicker';
import SmsStatusBadge from './SmsStatusBadge';
import { displayName, formatPhone, amountLabel, monthLabel, dateLabel, thisMonth } from '../../../utils/tithe';

const PAGE_SIZE = 25;
const BADGE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium';

/**
 * The register: who tithes, how to reach them and when they last paid.
 * Filtering is done by the server; the page shell owns the modals this opens.
 *
 * Props:
 *   refreshKey       – change it to reload the list after a change made elsewhere
 *   onOpenTither     – (titherId) => void
 *   onRecordPayment  – (tither) => void
 *   onAddTither      – () => void
 *   onImport         – () => void
 */
export default function TithersPanel({ refreshKey, onOpenTither, onRecordPayment, onAddTither, onImport }) {
  const [search, setSearch]       = useState('');        // what is typed
  const [q, setQ]                 = useState('');        // what is searched, after a pause
  const [type, setType]           = useState('');
  const [status, setStatus]       = useState('active');
  const [payFilter, setPayFilter] = useState('');        // '' | 'paid' | 'unpaid'
  const [payMonth, setPayMonth]   = useState(thisMonth);
  const [page, setPage]           = useState(1);

  // Search on a pause in typing rather than on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchFn = useCallback(() => adminApi.getTithers({
    q:      q || undefined,
    type:   type || undefined,
    status,
    paid:   payFilter === 'paid'   ? payMonth : undefined,
    unpaid: payFilter === 'unpaid' ? payMonth : undefined,
    page,
    limit:  PAGE_SIZE,
  }), [q, type, status, payFilter, payMonth, page]);
  // refreshKey is a dep only so a change made elsewhere on the page reloads the list.
  const { data, loading, error, refetch } = useApi(fetchFn, [q, type, status, payFilter, payMonth, page, refreshKey]);
  const tithers = data?.tithers ?? [];
  const total   = data?.total ?? 0;

  // Archiving or deleting the last row on a page leaves that page empty; step back.
  useEffect(() => {
    if (!loading && !error && data && tithers.length === 0 && total > 0 && page > 1) {
      setPage(Math.max(Math.ceil(total / PAGE_SIZE), 1));
    }
  }, [loading, error, data, tithers.length, total, page]);

  // Every filter change starts again from page 1.
  const filter = (setter) => (value) => { setter(value); setPage(1); };
  const searchNow = () => { setQ(search.trim()); setPage(1); };

  const hasFilters = Boolean(q || type || payFilter) || status !== 'active';
  // Rows stay on screen, faded, while a reload is in flight; the skeleton is
  // only for the very first load.
  const reloading  = loading && Boolean(data);
  // Nobody active and nothing filtered: either the register is empty or every
  // account on it is archived — they need different words.
  const noneActive = !error && Boolean(data) && total === 0 && !hasFilters;

  // How many accounts there are at all, archived included; null until known.
  const [allCount, setAllCount] = useState(null);
  useEffect(() => {
    if (!noneActive || loading) return undefined;
    let cancelled = false;
    adminApi.getTithers({ status: 'all', limit: 1 })
      .then(({ data: all }) => { if (!cancelled) setAllCount(all?.total ?? all?.tithers?.length ?? 0); })
      // Can't tell: offer the way to get started rather than nothing.
      .catch(() => { if (!cancelled) setAllCount(0); });
    return () => { cancelled = true; };
  }, [noneActive, loading]);

  const registerEmpty = noneActive && allCount === 0;
  const allArchived   = noneActive && allCount > 0;
  const checking      = noneActive && allCount === null;

  const columns = [
    {
      key: 'number',
      label: 'No.',
      width: '90px',
      render: (row) => <span className="font-mono text-xs text-ink/80">{row.number}</span>,
    },
    {
      key: 'name',
      label: 'Tither',
      render: (row) => (
        <p className="font-medium text-ink/90 text-sm leading-tight flex items-center gap-1.5">
          {displayName(row)}
          {row.type === 'COUPLE' && (
            <span className={`${BADGE} bg-purple-brand/10 text-purple-brand`}>Couple</span>
          )}
          {!row.isActive && (
            <span className={`${BADGE} bg-ink/5 text-ink/50`}>Archived</span>
          )}
        </p>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (row) => {
        const phones = [row.phone, row.type === 'COUPLE' && row.spousePhone].filter(Boolean);
        if (!phones.length) {
          return (
            <div>
              <p className="text-ink/25 text-xs">—</p>
              <p className="text-ink/35 text-[11px]">no SMS</p>
            </div>
          );
        }
        return (
          <div className="text-xs text-ink/70 space-y-0.5">
            {phones.map((p, i) => <p key={i}>{formatPhone(p)}</p>)}
          </div>
        );
      },
    },
    {
      key: 'lastPayment',
      label: 'Last payment',
      render: (row) => row.lastPayment ? (
        <div>
          <p className="text-sm text-ink/80 leading-tight">
            {amountLabel(row.lastPayment.amount)}
            <span className="text-ink/45"> for {monthLabel(row.lastPayment.month)}</span>
          </p>
          <p className="text-ink/40 text-[11px] mt-0.5">{dateLabel(row.lastPayment.paidOn)}</p>
        </div>
      ) : (
        <span className="text-ink/35 text-xs">No payments yet</span>
      ),
    },
    {
      key: 'sms',
      label: 'SMS',
      render: (row) => <SmsStatusBadge status={row.lastPayment?.smsStatus} />,
    },
    {
      key: '_actions',
      label: '',
      width: '140px',
      render: (row) => (
        // The wrapper keeps a click on the disabled button from opening the row.
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onRecordPayment(row)}
            disabled={!row.isActive}
            title={row.isActive ? undefined : 'Restore this account before recording a payment'}
            className="btn-outline text-[11px] px-3 py-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Record payment
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            className="input pl-8 pr-8 py-2 text-sm"
            placeholder="Search number, name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') searchNow(); }}
            aria-label="Search tithers"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select
          className="input py-2 text-sm w-auto"
          value={type}
          onChange={(e) => filter(setType)(e.target.value)}
          aria-label="Type"
        >
          <option value="">All types</option>
          <option value="INDIVIDUAL">Individual</option>
          <option value="COUPLE">Couple</option>
        </select>

        <select
          className="input py-2 text-sm w-auto"
          value={status}
          onChange={(e) => filter(setStatus)(e.target.value)}
          aria-label="Status"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>

        <select
          className="input py-2 text-sm w-auto"
          value={payFilter}
          onChange={(e) => filter(setPayFilter)(e.target.value)}
          aria-label="Payment"
        >
          <option value="">Everyone</option>
          <option value="paid">Paid for…</option>
          <option value="unpaid">Not paid for…</option>
        </select>

        {payFilter && (
          <MonthPicker value={payMonth} onChange={filter(setPayMonth)} />
        )}
      </div>

      {error && !loading ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body flex items-center justify-between gap-3 flex-wrap">
          <span>Couldn’t load the tithers: {error}</span>
          <button type="button" onClick={refetch} className="btn-outline text-xs px-3 py-1.5">
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : checking ? (
        <AdminTable columns={columns} rows={[]} loading />
      ) : allArchived ? (
        <div className={`bg-white rounded-xl border border-purple-brand/8 py-14 px-6 text-center transition-opacity ${reloading ? 'opacity-60' : ''}`}>
          <div className="w-12 h-12 mx-auto rounded-full bg-ink/5 flex items-center justify-center text-ink/45">
            <Archive size={20} />
          </div>
          <p className="font-display text-lg text-ink font-light mt-4">Every account is archived</p>
          <p className="text-ink/50 font-body text-sm mt-1 max-w-md mx-auto">
            {allCount === 1 ? 'The one account on the register is archived' : `All ${allCount} accounts on the register are archived`},
            so nobody is on the active list. Restore an account to record payments for it again.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-5">
            <button type="button" onClick={() => filter(setStatus)('archived')} className="btn-primary text-sm px-5 py-2">
              <Archive size={14} /> Show archived
            </button>
            <button type="button" onClick={onAddTither} className="btn-outline text-sm px-5 py-2">
              <UserPlus size={14} /> Add a tither
            </button>
          </div>
        </div>
      ) : registerEmpty ? (
        <div className={`bg-white rounded-xl border border-purple-brand/8 py-14 px-6 text-center transition-opacity ${reloading ? 'opacity-60' : ''}`}>
          <div className="w-12 h-12 mx-auto rounded-full bg-purple-brand/10 flex items-center justify-center text-purple-brand">
            <Coins size={20} />
          </div>
          <p className="font-display text-lg text-ink font-light mt-4">No tithers on the register yet</p>
          <p className="text-ink/50 font-body text-sm mt-1 max-w-md mx-auto">
            Add people one at a time, or upload a spreadsheet of the whole register to get started.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-5">
            <button type="button" onClick={onAddTither} className="btn-primary text-sm px-5 py-2">
              <UserPlus size={14} /> Add a tither
            </button>
            <button type="button" onClick={onImport} className="btn-outline text-sm px-5 py-2">
              <Upload size={14} /> Upload a list
            </button>
          </div>
        </div>
      ) : (
        <>
          {data && (
            <p className={`text-xs text-ink/40 font-body mb-2 transition-opacity ${reloading ? 'opacity-50' : ''}`}>
              {total} tither{total !== 1 ? 's' : ''}
            </p>
          )}
          <div className={`transition-opacity ${reloading ? 'opacity-60' : ''}`}>
            <AdminTable
              columns={columns}
              rows={tithers}
              loading={loading && !data}
              empty="No tithers match."
              onRow={(row) => onOpenTither(row.id)}
            />
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onChange={setPage}
              noun="tithers"
            />
          </div>
        </>
      )}
    </div>
  );
}
