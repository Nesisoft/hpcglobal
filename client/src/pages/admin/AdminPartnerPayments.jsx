import { useState, useCallback } from 'react';
import { Download, TrendingUp, DollarSign, Calendar, Users2 } from 'lucide-react';
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
} from 'recharts';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';
import { downloadBlob } from '../../utils/download';

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
const PIE_COLORS = ['#7E5BAC', '#C49A3C', '#5B8AC4', '#4CAF8A', '#E07D4F'];

const fmtAmt  = (n) => `GHS ${Number(n ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-purple-brand/8 p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0">
        <Icon size={18} className="text-gold" />
      </div>
      <div className="min-w-0">
        <p className="text-ink/45 text-xs font-body uppercase tracking-wider">{label}</p>
        <p className="font-display text-xl text-ink font-light mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-ink/40 text-xs font-body mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminPartnerPayments() {
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMethod, setFilterMethod] = useState('');

  const summaryFn = useCallback(() => adminApi.partnerPaymentsSummary(), []);
  const { data: summary, error: summaryError } = useApi(summaryFn);

  const recordsFn = useCallback(
    () => adminApi.getPartnerPayments({
      status: filterStatus || undefined,
      method: filterMethod || undefined,
    }),
    [filterStatus, filterMethod]
  );
  const { data: rawRecords, loading } = useApi(recordsFn, [filterStatus, filterMethod]);
  const records = rawRecords?.records ?? [];
  const total   = rawRecords?.total   ?? 0;

  async function handleExport() {
    try {
      const { data } = await adminApi.exportPartnerPayments({
        status: filterStatus || undefined,
        method: filterMethod || undefined,
      });
      downloadBlob(data, `partner-payments-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      alert('Export failed. Please try again.');
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Partner',
      render: (row) => (
        <div>
          <p className="font-medium text-ink/90 text-sm leading-tight">{row.name}</p>
          <p className="text-ink/40 text-[11px]">{row.email || row.phone}</p>
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
    <AdminLayout title="Partner Payments">
      <AdminPageHeader
        title="Partner Payments"
        subtitle={`${total} payment${total !== 1 ? 's' : ''} · partner commitments only`}
        action={{ label: 'Export CSV', icon: Download, onClick: handleExport }}
      />

      {summaryError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-red-600 text-sm font-body">
          Summary failed to load: {summaryError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Calendar}
          label="This month"
          value={fmtAmt(summary?.month?.total)}
          sub={`${summary?.month?.count ?? 0} payment${summary?.month?.count !== 1 ? 's' : ''}`}
        />
        <StatCard
          icon={TrendingUp}
          label="This year"
          value={fmtAmt(summary?.year?.total)}
          sub={`${summary?.year?.count ?? 0} payment${summary?.year?.count !== 1 ? 's' : ''}`}
        />
        <StatCard
          icon={DollarSign}
          label="Avg. this month"
          value={summary?.month?.count > 0 ? fmtAmt(summary.month.total / summary.month.count) : 'GHS 0.00'}
          sub="per transaction"
        />
        <StatCard
          icon={Users2}
          label="Active partners"
          value={summary?.uniquePartners ?? 0}
          sub="with completed payments"
        />
      </div>

      {/* Payment method chart */}
      {(summary?.byMethod?.length > 0) && (
        <div className="bg-white rounded-xl border border-purple-brand/8 p-5 mb-6 max-w-sm">
          <h3 className="font-display text-base text-ink font-light mb-4">By Payment Method</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={[...(summary.byMethod)]
                  .sort((a, b) => (b._sum?.amount ?? 0) - (a._sum?.amount ?? 0))
                  .map((r) => ({ name: METHOD_LABELS[r.method] ?? r.method, value: r._sum?.amount ?? 0 }))}
                cx="50%"
                cy="45%"
                outerRadius={70}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {summary.byMethod.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [fmtAmt(v), 'Total']} contentStyle={{ borderRadius: 8, border: '1px solid #E8E4F3', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
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
        empty="No partner payments yet."
      />
    </AdminLayout>
  );
}
