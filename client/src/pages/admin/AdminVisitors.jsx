import { useState, useCallback } from 'react';
import { UserPlus, Phone, Mail, MapPin, Globe, X, Check, Download, Users } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';
import AdminModal from '../../components/admin/AdminModal';
import FormField from '../../components/admin/FormField';
import Toggle from '../../components/admin/Toggle';
import { downloadBlob } from '../../utils/download';

const STATUSES = ['NEW', 'CONTACTED', 'ATTENDING', 'MEMBER'];

const STATUS_COLORS = {
  NEW:       'bg-purple-brand/10 text-purple-brand',
  CONTACTED: 'bg-gold/10 text-gold',
  ATTENDING: 'bg-blue-50 text-blue-700',
  MEMBER:    'bg-green-50 text-green-700',
};

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminVisitors() {
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected]         = useState(null);
  const [form, setForm]                 = useState({ status: 'NEW', adminNotes: '', followedUp: false });
  const [saving, setSaving]             = useState(false);
  const [checkedIds, setCheckedIds]     = useState(new Set());
  const [bulking, setBulking]           = useState(false);

  const fetchFn = useCallback(
    () => adminApi.getVisitors({ status: filterStatus || undefined }),
    [filterStatus]
  );
  const { data, loading, refetch } = useApi(fetchFn, [filterStatus]);
  const visitors = data?.visitors ?? [];
  const total    = data?.total ?? 0;

  function toggleCheck(id, e) {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(e) {
    setCheckedIds(e.target.checked ? new Set(visitors.map((v) => v.id)) : new Set());
  }

  async function handleBulkStatus(status) {
    if (!checkedIds.size) return;
    setBulking(true);
    try {
      await adminApi.bulkUpdateVisitors({ ids: [...checkedIds], status });
      setCheckedIds(new Set());
      refetch();
    } catch {
      // silent
    } finally {
      setBulking(false);
    }
  }

  function openDetail(row) {
    setSelected(row);
    setForm({
      status:     row.status,
      adminNotes: row.adminNotes ?? '',
      followedUp: !!row.followedUpAt,
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        status:       form.status,
        adminNotes:   form.adminNotes,
        followedUpAt: form.followedUp
          ? (selected.followedUpAt ?? new Date().toISOString())
          : null,
      };
      await adminApi.updateVisitor(selected.id, payload);
      setSelected(null);
      refetch();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    try {
      const { data } = await adminApi.exportVisitors({ status: filterStatus || undefined });
      downloadBlob(data, `visitors-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      alert('Export failed. Please try again.');
    }
  }

  const allChecked = visitors.length > 0 && checkedIds.size === visitors.length;

  const columns = [
    {
      key: '_check',
      label: (
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          className="accent-purple-brand cursor-pointer"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          checked={checkedIds.has(row.id)}
          onChange={(e) => toggleCheck(row.id, e)}
          onClick={(e) => e.stopPropagation()}
          className="accent-purple-brand cursor-pointer"
        />
      ),
    },
    {
      key: 'name',
      label: 'Visitor',
      render: (row) => (
        <div>
          <p className="font-medium text-ink/90 text-sm leading-tight">{row.name}</p>
          <p className="text-ink/40 text-[11px]">{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'location',
      label: 'Location',
      render: (row) => {
        const parts = [row.city, row.country].filter(Boolean);
        return parts.length
          ? <span className="text-ink/70 text-sm">{parts.join(', ')}</span>
          : <span className="text-ink/25 text-xs">—</span>;
      },
    },
    {
      key: 'source',
      label: 'Source',
      render: (row) => (
        <span className="text-ink/60 text-sm">{row.source || '—'}</span>
      ),
    },
    {
      key: 'preferredSvc',
      label: 'Preferred Service',
      render: (row) => (
        <span className="text-ink/60 text-sm">{row.preferredSvc || '—'}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[row.status] ?? STATUS_COLORS.NEW}`}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Registered',
      render: (row) => <span className="text-ink/60 text-xs">{fmtDate(row.createdAt)}</span>,
    },
  ];

  return (
    <AdminLayout title="Visitors">
      <AdminPageHeader
        title="Visitors"
        subtitle={`${total} visitor${total !== 1 ? 's' : ''} · click a row to follow up`}
      >
        <div className="flex items-center gap-2">
          <select
            className="input py-2 text-sm w-36"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={handleExport} className="btn-outline text-sm px-4 py-2">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </AdminPageHeader>

      {/* Bulk action bar */}
      {checkedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 bg-purple-brand/5 border border-purple-brand/15 rounded-lg px-4 py-2.5">
          <Users size={14} className="text-purple-brand flex-shrink-0" />
          <span className="text-sm font-body text-purple-brand font-medium">
            {checkedIds.size} selected
          </span>
          <span className="text-ink/20">·</span>
          <span className="text-xs font-body text-ink/50">Mark as:</span>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => handleBulkStatus(s)}
              disabled={bulking}
              className="text-xs font-body px-3 py-1.5 rounded border border-purple-brand/20 text-purple-brand hover:bg-purple-brand/10 transition-colors disabled:opacity-50"
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => setCheckedIds(new Set())}
            className="ml-auto text-ink/30 hover:text-ink transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <AdminTable
        columns={columns}
        rows={visitors}
        loading={loading}
        empty="No visitors match the current filters."
        onRow={openDetail}
      />

      <AdminModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Visitor Details"
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-purple-brand/8">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-purple-brand/10 flex items-center justify-center text-purple-brand">
                  <UserPlus size={18} />
                </div>
                <div>
                  <p className="font-display text-lg text-ink leading-tight font-light">{selected.name}</p>
                  <p className="text-ink/40 text-xs mt-0.5">Registered {fmtDate(selected.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Contact + location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm font-body">
              {selected.phone && (
                <div className="flex items-center gap-2 text-ink/70">
                  <Phone size={13} className="text-ink/40" />
                  <span>{selected.phone}</span>
                </div>
              )}
              {selected.email && (
                <div className="flex items-center gap-2 text-ink/70 min-w-0">
                  <Mail size={13} className="text-ink/40 flex-shrink-0" />
                  <span className="truncate">{selected.email}</span>
                </div>
              )}
              {(selected.city || selected.country) && (
                <div className="flex items-center gap-2 text-ink/70">
                  <MapPin size={13} className="text-ink/40" />
                  <span>{[selected.city, selected.country].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {selected.source && (
                <div className="flex items-center gap-2 text-ink/70">
                  <Globe size={13} className="text-ink/40" />
                  <span>{selected.source}</span>
                </div>
              )}
            </div>

            {selected.preferredSvc && (
              <FormField label="Preferred Service">
                <p className="text-sm text-ink/75">{selected.preferredSvc}</p>
              </FormField>
            )}

            {selected.message && (
              <FormField label="Their Message">
                <div className="rounded-lg bg-cream/40 border border-purple-brand/8 p-4 text-sm text-ink/80 font-body leading-relaxed whitespace-pre-wrap">
                  {selected.message}
                </div>
              </FormField>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Status">
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <div className="flex items-end pb-1">
                <Toggle
                  checked={form.followedUp}
                  onChange={(v) => setForm((f) => ({ ...f, followedUp: v }))}
                  label="Followed up"
                />
              </div>
            </div>

            <FormField label="Pastoral Notes" hint="Internal only — not visible to the visitor">
              <textarea
                className="input min-h-[80px] resize-y"
                value={form.adminNotes}
                onChange={(e) => setForm((f) => ({ ...f, adminNotes: e.target.value }))}
              />
            </FormField>

            {selected.followedUpAt && (
              <p className="text-[11px] text-ink/40 font-body">
                Last followed up on {fmtDate(selected.followedUpAt)}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-purple-brand/8">
              <button onClick={() => setSelected(null)} className="btn-outline text-sm px-5 py-2">
                <X size={14} /> Close
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
                {saving ? 'Saving…' : <><Check size={14} /> Save Changes</>}
              </button>
            </div>
          </div>
        )}
      </AdminModal>
    </AdminLayout>
  );
}
