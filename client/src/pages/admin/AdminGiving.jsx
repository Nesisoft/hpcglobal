import { useState, useCallback } from 'react';
import { Download, TrendingUp, DollarSign, Calendar, BarChart2 } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';

// ─── Enum maps ────────────────────────────────────────────────────────────────
const CATEGORIES = ['TITHE', 'OFFERING', 'FIRST_FRUITS', 'BUILDING_FUND', 'MISSIONS', 'PASTORAL', 'OTHER'];
const CAT_LABELS = {
  TITHE:         'Tithe',
  OFFERING:      'Offering',
  FIRST_FRUITS:  'First Fruits',
  BUILDING_FUND: 'Building Fund',
  MISSIONS:      'Missions',
  PASTORAL:      'Pastoral',
  OTHER:         'Other',
};

const METHODS = ['MTN_MOMO', 'TELECEL', 'AIRTELTIGO', 'BANK_TRANSFER', 'CARD'];
const METHOD_LABELS = {
  MTN_MOMO:      'MTN MoMo',
  TELECEL:       'Telecel',
  AIRTELTIGO:    'AirtelTigo',
  BANK_TRANSFER: 'Bank Transfer',
  CARD:          'Card',
};

const STATUSES = ['PENDING', 'COMPLETED', 'FAILED'];
const STATUS_COLORS = {
  PENDING:   'bg-gold/10 text-gold',
  COMPLETED: 'bg-green-50 text-green-700',
  FAILED:    'bg-red-50 text-red-600',
};

const fmtAmt   = (n) => `GHS ${Number(n ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtDate  = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime  = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl border border-purple-brand/8 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${accent ?? 'bg-purple-brand/10'}`}>
        <Icon size={18} className="text-purple-brand" />
      </div>
      <div className="min-w-0">
        <p className="text-ink/45 text-xs font-body uppercase tracking-wider">{label}</p>
        <p className="font-display text-xl text-ink font-light mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-ink/40 text-xs font-body mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Category breakdown row ───────────────────────────────────────────────────
function BreakdownBar({ label, amount, total }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <p className="text-ink/70 text-xs font-body w-28 flex-shrink-0 truncate">{label}</p>
      <div className="flex-1 h-2 rounded-full bg-purple-brand/8 overflow-hidden">
        <div
          className="h-full bg-purple-brand/40 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-ink/60 text-xs font-body w-32 text-right flex-shrink-0">{fmtAmt(amount)}</p>
      <p className="text-ink/35 text-xs font-body w-8 text-right flex-shrink-0">{pct}%</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminGiving() {
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMethod,   setFilterMethod]   = useState('');

  // Summary stats
  const summaryFn = useCallback(() => adminApi.givingSummary(), []);
  const { data: summary } = useApi(summaryFn);

  // Records list
  const recordsFn = useCallback(
    () => adminApi.getGiving({
      status:   filterStatus   || undefined,
      category: filterCategory || undefined,
      method:   filterMethod   || undefined,
    }),
    [filterStatus, filterCategory, filterMethod]
  );
  const { data: rawRecords, loading, refetch } = useApi(recordsFn, [filterStatus, filterCategory, filterMethod]);
  const records = rawRecords?.records ?? [];
  const total   = rawRecords?.total   ?? 0;

  // Totals from summary
  const monthTotal = summary?.month?.total ?? 0;
  const monthCount = summary?.month?.count ?? 0;
  const yearTotal  = summary?.year?.total  ?? 0;
  const yearCount  = summary?.year?.count  ?? 0;

  const allCatTotal = (summary?.byCategory ?? []).reduce((s, r) => s + (r._sum?.amount ?? 0), 0);

  // Export
  function handleExport() {
    const params = new URLSearchParams({
      ...(filterStatus   && { status:   filterStatus   }),
      ...(filterCategory && { category: filterCategory }),
      ...(filterMethod   && { method:   filterMethod   }),
    });
    // Build CSV from current records (client-side for simplicity)
    const header = ['Name', 'Phone', 'Email', 'Amount', 'Category', 'Method', 'Status', 'Reference', 'Date'].join(',');
    const rows   = records.map((r) => [
      `"${r.name}"`,
      r.phone,
      r.email || '',
      r.amount,
      CAT_LABELS[r.category] ?? r.category,
      METHOD_LABELS[r.method] ?? r.method,
      r.status,
      r.reference || '',
      fmtDate(r.createdAt),
    ].join(','));
    const csv  = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `giving-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = [
    {
      key: 'name',
      label: 'Donor',
      render: (row) => (
        <div>
          <p className="font-medium text-ink/90 text-sm leading-tight">{row.name}</p>
          <p className="text-ink/40 text-[11px]">{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (row) => (
        <span className="font-display text-base text-ink font-light">{fmtAmt(row.amount)}</span>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-brand/10 text-purple-brand">
          {CAT_LABELS[row.category] ?? row.category}
        </span>
      ),
    },
    {
      key: 'method',
      label: 'Method',
      render: (row) => (
        <span className="text-ink/70 text-sm">{METHOD_LABELS[row.method] ?? row.method}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[row.status] ?? ''}`}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'reference',
      label: 'Reference',
      render: (row) => (
        <span className="text-ink/50 text-xs font-mono">{row.reference || '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      render: (row) => (
        <div>
          <p className="text-ink/70 text-xs">{fmtDate(row.createdAt)}</p>
          <p className="text-ink/35 text-[11px]">{fmtTime(row.createdAt)}</p>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout title="Giving">
      <AdminPageHeader
        title="Giving"
        subtitle={`${total} record${total !== 1 ? 's' : ''} · SUPER_ADMIN access only`}
        action={{ label: 'Export CSV', icon: Download, onClick: handleExport }}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Calendar}
          label="This month"
          value={fmtAmt(monthTotal)}
          sub={`${monthCount} transaction${monthCount !== 1 ? 's' : ''}`}
        />
        <StatCard
          icon={TrendingUp}
          label="This year"
          value={fmtAmt(yearTotal)}
          sub={`${yearCount} transaction${yearCount !== 1 ? 's' : ''}`}
        />
        <StatCard
          icon={DollarSign}
          label="Avg. this month"
          value={monthCount > 0 ? fmtAmt(monthTotal / monthCount) : 'GHS 0.00'}
          sub="per transaction"
        />
        <StatCard
          icon={BarChart2}
          label="Top category"
          value={(() => {
            const top = [...(summary?.byCategory ?? [])].sort((a, b) => (b._sum?.amount ?? 0) - (a._sum?.amount ?? 0))[0];
            return top ? CAT_LABELS[top.category] ?? top.category : '—';
          })()}
          sub="by total volume"
        />
      </div>

      {/* Category breakdown */}
      {summary?.byCategory?.length > 0 && (
        <div className="bg-white rounded-xl border border-purple-brand/8 p-5 mb-6">
          <h3 className="font-display text-base text-ink font-light mb-4">By Category (all time)</h3>
          <div className="space-y-3">
            {[...(summary.byCategory)]
              .sort((a, b) => (b._sum?.amount ?? 0) - (a._sum?.amount ?? 0))
              .map((row) => (
                <BreakdownBar
                  key={row.category}
                  label={CAT_LABELS[row.category] ?? row.category}
                  amount={row._sum?.amount ?? 0}
                  total={allCatTotal}
                />
              ))}
          </div>
        </div>
      )}

      {/* Method breakdown */}
      {summary?.byMethod?.length > 0 && (
        <div className="bg-white rounded-xl border border-purple-brand/8 p-5 mb-6">
          <h3 className="font-display text-base text-ink font-light mb-4">By Payment Method (all time)</h3>
          <div className="space-y-3">
            {[...(summary.byMethod)]
              .sort((a, b) => (b._sum?.amount ?? 0) - (a._sum?.amount ?? 0))
              .map((row) => (
                <BreakdownBar
                  key={row.method}
                  label={METHOD_LABELS[row.method] ?? row.method}
                  amount={row._sum?.amount ?? 0}
                  total={allCatTotal}
                />
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          className="input py-2 text-sm w-36"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className="input py-2 text-sm w-40"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
        </select>
        <select
          className="input py-2 text-sm w-40"
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
        >
          <option value="">All methods</option>
          {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
        </select>
      </div>

      <AdminTable
        columns={columns}
        rows={records}
        loading={loading}
        empty="No giving records match the current filters."
      />
    </AdminLayout>
  );
}
