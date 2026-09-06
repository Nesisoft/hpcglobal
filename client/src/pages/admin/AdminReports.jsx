import { useState, useCallback } from 'react';
import { Download, Users, AlertTriangle, Check, X, Eye } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';
import AdminPagination from '../../components/admin/AdminPagination';
import AdminModal from '../../components/admin/AdminModal';
import FormField from '../../components/admin/FormField';
import { downloadBlob } from '../../utils/download';
import {
  PERIOD_TYPES, PERIOD_LABELS, REPORT_STATUSES, STATUS_LABELS, STATUS_COLORS,
  ATTENDANCE_FIELDS, NARRATIVE_FIELDS, fmtPeriod,
} from '../../config/reports';

const PAGE_SIZE = 20;

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** One labelled block of the read-only report view. */
function Detail({ label, children }) {
  return (
    <div>
      <p className="text-ink/40 text-[10px] font-body uppercase tracking-wider mb-1">{label}</p>
      <div className="text-ink/80 text-sm font-body whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}

function ReportDetail({ report }) {
  const counts = ATTENDANCE_FIELDS.filter(({ key }) => report[key] !== null && report[key] !== undefined);
  const narrative = NARRATIVE_FIELDS.filter(({ key }) => report[key]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-purple-brand/8">
        <Detail label="Department">{report.department}</Detail>
        <Detail label="Head of dept">{report.hodName}</Detail>
        <Detail label="Period">{fmtPeriod(report)}</Detail>
        <Detail label="Type">{PERIOD_LABELS[report.periodType] ?? report.periodType}</Detail>
      </div>

      {counts.length > 0 && (
        <div>
          <h3 className="font-display text-base text-ink font-light mb-3">Attendance</h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {counts.map(({ key, label }) => (
              <div key={key} className="bg-[#F9F8FC] rounded-lg px-3 py-2.5">
                <p className="text-ink/40 text-[10px] font-body uppercase tracking-wider leading-tight">{label}</p>
                <p className="font-display text-lg text-ink font-light mt-0.5">{report[key]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(report.absenteeCount != null || report.absenteeNames || report.followUpNotes) && (
        <div className="space-y-3">
          <h3 className="font-display text-base text-ink font-light">Absentees</h3>
          {report.absenteeCount != null && <Detail label="Number absent">{report.absenteeCount}</Detail>}
          {report.absenteeNames && <Detail label="Names">{report.absenteeNames}</Detail>}
          {report.followUpNotes && <Detail label="Follow-up done">{report.followUpNotes}</Detail>}
        </div>
      )}

      {narrative.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-display text-base text-ink font-light">Report</h3>
          {narrative.map(({ key, label }) => <Detail key={key} label={label}>{report[key]}</Detail>)}
        </div>
      )}

      {report.offeringAmount != null && (
        <Detail label="Offering / funds received">
          GHS {Number(report.offeringAmount).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
        </Detail>
      )}

      <div className="grid grid-cols-2 gap-4 pt-5 border-t border-purple-brand/8">
        <Detail label="Submitted">{fmtDateTime(report.createdAt)}</Detail>
        <Detail label="Reviewed">{fmtDateTime(report.reviewedAt)}</Detail>
      </div>
    </div>
  );
}

export default function AdminReports() {
  const [filterDept,   setFilterDept]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [page, setPage] = useState(1);

  const [viewing, setViewing]   = useState(null);
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');

  // Any filter change invalidates the current offset.
  const changeFilter = (setFilter) => (e) => {
    setFilter(e.target.value);
    setPage(1);
  };

  const params = {
    department: filterDept   || undefined,
    status:     filterStatus || undefined,
    periodType: filterPeriod || undefined,
    from:       from || undefined,
    to:         to   || undefined,
  };

  const deptFn = useCallback(() => adminApi.getReportDepartments(), []);
  const { data: rawDepts } = useApi(deptFn);
  const departments = Array.isArray(rawDepts) ? rawDepts : [];

  const listFn = useCallback(
    () => adminApi.getReports({ ...params, page, limit: PAGE_SIZE }),
    [filterDept, filterStatus, filterPeriod, from, to, page]
  );
  const { data, loading, error, refetch } =
    useApi(listFn, [filterDept, filterStatus, filterPeriod, from, to, page]);
  const reports = data?.records ?? [];
  const total   = data?.total   ?? 0;

  function openReport(row) {
    setViewing(row);
    setNotes(row.adminNotes ?? '');
    setSaveError('');
  }

  // `status` defaults to whatever the report already has, so notes can be saved
  // without also closing the report to its author.
  async function review(status = viewing.status) {
    setSaving(true);
    setSaveError('');
    try {
      await adminApi.reviewReport(viewing.id, { status, adminNotes: notes });
      setViewing(null);
      refetch();
    } catch (e) {
      setSaveError(e.response?.data?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    try {
      const { data: blob } = await adminApi.exportReports(params);
      downloadBlob(blob, `department-reports-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      alert('Export failed. Please try again.');
    }
  }

  const columns = [
    {
      key: 'department',
      label: 'Department',
      render: (r) => (
        <div>
          <p className="font-medium text-ink/90 text-sm leading-tight">{r.department}</p>
          <p className="text-ink/40 text-[11px]">{r.hodName}</p>
        </div>
      ),
    },
    {
      key: 'periodStart',
      label: 'Period',
      render: (r) => (
        <div>
          <p className="text-ink/75 text-xs">{fmtPeriod(r)}</p>
          <p className="text-ink/35 text-[11px]">{PERIOD_LABELS[r.periodType] ?? r.periodType}</p>
        </div>
      ),
    },
    {
      key: 'attendanceTotal',
      label: 'Attendance',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-ink/70 text-sm">
          <Users size={13} className="text-ink/30" />{r.attendanceTotal ?? '—'}
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
      label: 'Issues',
      render: (r) => (
        r.issues
          ? <span className="inline-flex items-center gap-1 text-gold text-xs" title={r.issues}>
              <AlertTriangle size={12} /> Raised
            </span>
          : <span className="text-ink/25 text-xs">—</span>
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
      width: '50px',
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); openReport(r); }} title="Open"
          className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors">
          <Eye size={14} />
        </button>
      ),
    },
  ];

  return (
    <AdminLayout title="Department Reports">
      <AdminPageHeader
        title="Department Reports"
        subtitle={`${total} report${total !== 1 ? 's' : ''} from heads of department`}
        action={{ label: 'Export CSV', icon: Download, onClick: handleExport }}
      />

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <select className="input py-2 text-sm w-44" value={filterDept} onChange={changeFilter(setFilterDept)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="input py-2 text-sm w-36" value={filterStatus} onChange={changeFilter(setFilterStatus)}>
          <option value="">All statuses</option>
          {REPORT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select className="input py-2 text-sm w-40" value={filterPeriod} onChange={changeFilter(setFilterPeriod)}>
          <option value="">All periods</option>
          {PERIOD_TYPES.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
        </select>
        <label className="text-ink/40 text-[10px] font-body uppercase tracking-wider">
          From
          <input type="date" className="input py-2 text-sm w-40 mt-1" value={from} onChange={changeFilter(setFrom)} />
        </label>
        <label className="text-ink/40 text-[10px] font-body uppercase tracking-wider">
          To
          <input type="date" className="input py-2 text-sm w-40 mt-1" value={to} onChange={changeFilter(setTo)} />
        </label>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body flex items-center justify-between gap-3">
          <span>Could not load reports: {error}</span>
          <button type="button" onClick={refetch} className="underline flex-shrink-0">Retry</button>
        </div>
      ) : (
        <>
          <AdminTable
            columns={columns}
            rows={reports}
            loading={loading}
            onRow={openReport}
            empty="No department reports match the current filters."
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

      <AdminModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.department} — ${fmtPeriod(viewing)}` : ''}
        size="xl"
      >
        {viewing && (
          <>
            <ReportDetail report={viewing} />

            <div className="mt-6 pt-5 border-t border-purple-brand/8">
              <FormField label="Notes back to the department" hint="Saved with the report and visible to admins.">
                <textarea rows={3} className="input resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </FormField>
            </div>

            {saveError && <p className="text-red-500 text-xs font-body mt-3">{saveError}</p>}

            <div className="flex flex-wrap justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
              <button onClick={() => setViewing(null)} className="btn-outline text-sm px-5 py-2">
                <X size={14} /> Close
              </button>
              <button onClick={() => review()} disabled={saving || notes === (viewing.adminNotes ?? '')}
                className="btn-outline text-sm px-5 py-2 disabled:opacity-40">
                Save Notes
              </button>
              {/* Reopening hands editing back to the HoD, so it is offered as
                  the counterpart to marking a report reviewed. */}
              {viewing.status === 'REVIEWED' ? (
                <button onClick={() => review('SUBMITTED')} disabled={saving}
                  className="btn-outline text-sm px-5 py-2 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Reopen for editing'}
                </button>
              ) : (
                <button onClick={() => review('REVIEWED')} disabled={saving}
                  className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
                  {saving ? 'Saving…' : <><Check size={14} /> Mark Reviewed</>}
                </button>
              )}
            </div>
          </>
        )}
      </AdminModal>
    </AdminLayout>
  );
}
