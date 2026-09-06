import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, Pencil, Users, AlertTriangle } from 'lucide-react';
import { hodApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import HodLayout from '../../components/hod/HodLayout';
import AdminTable from '../../components/admin/AdminTable';
import AdminPagination from '../../components/admin/AdminPagination';
import { PERIOD_LABELS, STATUS_LABELS, STATUS_COLORS, fmtPeriod } from '../../config/reports';

const PAGE_SIZE = 20;

export default function HodReports() {
  const [page, setPage] = useState(1);

  const meFn = useCallback(() => hodApi.me(), []);
  const { data: me } = useApi(meFn);

  const listFn = useCallback(() => hodApi.listReports({ page, limit: PAGE_SIZE }), [page]);
  const { data, loading, error, refetch } = useApi(listFn, [page]);
  const reports = data?.records ?? [];
  const total   = data?.total   ?? 0;

  const columns = [
    {
      key: 'periodStart',
      label: 'Period',
      render: (r) => (
        <div>
          <p className="text-ink/85 text-sm font-medium leading-tight">{fmtPeriod(r)}</p>
          <p className="text-ink/40 text-[11px]">{PERIOD_LABELS[r.periodType] ?? r.periodType}</p>
        </div>
      ),
    },
    {
      key: 'attendanceTotal',
      label: 'Attendance',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-ink/70 text-sm">
          <Users size={13} className="text-ink/30" />
          {r.attendanceTotal ?? '—'}
        </span>
      ),
    },
    {
      key: 'absenteeCount',
      label: 'Absent',
      render: (r) => <span className="text-ink/70 text-sm">{r.absenteeCount ?? '—'}</span>,
    },
    {
      key: 'issues',
      label: 'Issues raised',
      render: (r) => (
        r.issues
          ? <span className="inline-flex items-center gap-1.5 text-ink/60 text-xs">
              <AlertTriangle size={12} className="text-gold" /> Yes
            </span>
          : <span className="text-ink/30 text-xs">—</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[r.status] ?? ''}`}>
          {STATUS_LABELS[r.status] ?? r.status}
        </span>
      ),
    },
    {
      key: '_actions',
      label: '',
      width: '60px',
      // A reviewed report is closed — the server refuses the edit, so the
      // affordance goes away rather than failing on submit.
      render: (r) => (
        r.status === 'REVIEWED'
          ? <span className="text-ink/25 text-[11px] font-body">Closed</span>
          : (
            <Link to={`/hod/reports/${r.id}/edit`} title="Edit"
              className="inline-flex p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors">
              <Pencil size={14} />
            </Link>
          )
      ),
    },
  ];

  return (
    <HodLayout title="My Reports" department={me?.department}>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-2xl text-ink font-light">My reports</h1>
          <p className="text-ink/50 text-sm font-body mt-1">
            {total} report{total !== 1 ? 's' : ''} filed
            {me?.department ? <> for <strong className="text-purple-brand font-medium">{me.department}</strong></> : null}
          </p>
        </div>
        <Link to="/hod" className="btn-primary text-sm px-5 py-2.5">
          <FilePlus2 size={14} /> New Report
        </Link>
      </div>

      {me?.department && (
        <div className="bg-white rounded-xl border border-purple-brand/8 p-4 mb-5 text-xs font-body text-ink/55">
          You can edit a report until an administrator marks it reviewed. Once reviewed it is
          closed, and any correction should be raised with the church office.
        </div>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body flex items-center justify-between gap-3">
          <span>Could not load your reports: {error}</span>
          <button type="button" onClick={refetch} className="underline flex-shrink-0">Retry</button>
        </div>
      ) : (
        <>
          <AdminTable
            columns={columns}
            rows={reports}
            loading={loading}
            empty="You have not filed any reports yet."
          />
          <AdminPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={setPage}
            noun="reports"
          />
        </>
      )}
    </HodLayout>
  );
}
