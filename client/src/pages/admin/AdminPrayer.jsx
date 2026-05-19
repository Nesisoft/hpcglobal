import { useState, useCallback } from 'react';
import { Heart, Lock, Phone, Mail, Calendar, X, Check } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';
import AdminModal from '../../components/admin/AdminModal';
import FormField from '../../components/admin/FormField';

const STATUSES = ['NEW', 'PRAYING', 'ANSWERED', 'CLOSED'];

const STATUS_COLORS = {
  NEW:      'bg-purple-brand/10 text-purple-brand',
  PRAYING:  'bg-gold/10 text-gold',
  ANSWERED: 'bg-green-50 text-green-700',
  CLOSED:   'bg-ink/5 text-ink/40',
};

const CATEGORIES = ['HEALTH', 'FAMILY', 'FINANCE', 'CAREER', 'SPIRITUAL', 'RELATIONSHIPS', 'OTHER'];

const CAT_LABELS = {
  HEALTH:        'Health',
  FAMILY:        'Family',
  FINANCE:       'Finance',
  CAREER:        'Career',
  SPIRITUAL:     'Spiritual',
  RELATIONSHIPS: 'Relationships',
  OTHER:         'Other',
};

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminPrayer() {
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [selected, setSelected]         = useState(null);
  const [status, setStatus]             = useState('NEW');
  const [notes, setNotes]               = useState('');
  const [saving, setSaving]             = useState(false);

  const fetchFn = useCallback(
    () => adminApi.getPrayer({ status: filterStatus || undefined, category: filterCat || undefined }),
    [filterStatus, filterCat]
  );
  const { data, loading, refetch } = useApi(fetchFn, [filterStatus, filterCat]);
  const requests = data?.requests ?? [];
  const total    = data?.total ?? 0;

  function openDetail(row) {
    setSelected(row);
    setStatus(row.status);
    setNotes(row.adminNotes ?? '');
  }

  async function handleSave() {
    setSaving(true);
    try {
      await adminApi.updatePrayer(selected.id, { status, adminNotes: notes });
      setSelected(null);
      refetch();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Requester',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.isPrivate && <Lock size={11} className="text-ink/40 flex-shrink-0" />}
          <div className="min-w-0">
            <p className="font-medium text-ink/90 text-sm leading-tight">{row.name || 'Anonymous'}</p>
            <p className="text-ink/40 text-[11px]">{row.phone || row.email || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink/5 text-ink/60">
          {CAT_LABELS[row.category] ?? row.category}
        </span>
      ),
    },
    {
      key: 'request',
      label: 'Request',
      render: (row) => (
        <p className="text-ink/70 text-sm line-clamp-1 max-w-md">{row.request}</p>
      ),
    },
    {
      key: 'wantsCall',
      label: 'Wants Call',
      render: (row) => row.wantsCall
        ? <span className="text-purple-brand text-xs font-medium">Yes</span>
        : <span className="text-ink/25 text-xs">—</span>,
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
      label: 'Received',
      render: (row) => <span className="text-ink/60 text-xs">{fmtDate(row.createdAt)}</span>,
    },
  ];

  return (
    <AdminLayout title="Prayer Requests">
      <AdminPageHeader
        title="Prayer Requests"
        subtitle={`${total} request${total !== 1 ? 's' : ''} · pastoral team only`}
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
          <select
            className="input py-2 text-sm w-40"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
          </select>
        </div>
      </AdminPageHeader>

      <AdminTable
        columns={columns}
        rows={requests}
        loading={loading}
        empty="No prayer requests match the current filters."
        onRow={openDetail}
      />

      <AdminModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Prayer Request"
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-purple-brand/8">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-purple-brand/10 flex items-center justify-center text-purple-brand">
                  <Heart size={18} />
                </div>
                <div>
                  <p className="font-display text-lg text-ink leading-tight font-light flex items-center gap-2">
                    {selected.name || 'Anonymous'}
                    {selected.isPrivate && (
                      <span className="inline-flex items-center gap-1 bg-ink/5 text-ink/50 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        <Lock size={9} /> Private
                      </span>
                    )}
                  </p>
                  <p className="text-ink/40 text-xs mt-0.5">{CAT_LABELS[selected.category]} · {fmtDate(selected.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm font-body">
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
              {selected.wantsCall && (
                <div className="flex items-center gap-2 text-purple-brand font-medium">
                  <Calendar size={13} />
                  <span>Wants a call</span>
                </div>
              )}
            </div>

            {/* Request body */}
            <FormField label="The Request">
              <div className="rounded-lg bg-cream/40 border border-purple-brand/8 p-4 text-sm text-ink/80 font-body leading-relaxed whitespace-pre-wrap">
                {selected.request}
              </div>
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="Status">
                <select
                  className="input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Pastoral Notes" hint="Internal only — not visible to the requester">
                  <textarea
                    className="input min-h-[70px] resize-y"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </FormField>
              </div>
            </div>

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
