import { useState, useCallback } from 'react';
import { Users, CheckCircle, X, UserPlus, Pencil, Trash2, Check, Globe, Phone, Mail, DollarSign } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import AdminTable from '../../components/admin/AdminTable';

const STATUS_COLORS = {
  PENDING:   'bg-gold/10 text-gold',
  APPROVED:  'bg-green-50 text-green-700',
  SUSPENDED: 'bg-red-50 text-red-500',
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtAmt  = (p) => `${p.currency} ${Number(p.monthlyAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function AdminPartners() {
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected]         = useState(null);
  const [editForm, setEditForm]         = useState({ status: '', adminNotes: '' });
  const [saving, setSaving]             = useState(false);
  const [activating, setActivating]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);

  const fetchFn = useCallback(
    () => adminApi.getPartners({ status: filterStatus || undefined }),
    [filterStatus]
  );
  const { data, loading, refetch } = useApi(fetchFn, [filterStatus]);
  const partners = data?.partners ?? [];
  const total    = data?.total ?? 0;

  function openDetail(row) {
    setSelected(row);
    setEditForm({ status: row.status, adminNotes: row.adminNotes ?? '' });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await adminApi.updatePartner(selected.id, editForm);
      setSelected(null);
      refetch();
    } catch { /* silent */ } finally { setSaving(false); }
  }

  async function handleActivate() {
    if (!selected) return;
    setActivating(true);
    try {
      await adminApi.activatePartner(selected.id);
      alert(`Account activated. Credentials sent to ${selected.email}`);
      setSelected(null);
      refetch();
    } catch (err) {
      alert(err.response?.data?.message || 'Activation failed.');
    } finally { setActivating(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await adminApi.deletePartner(deleteTarget.id);
      setDeleteTarget(null);
      if (selected?.id === deleteTarget.id) setSelected(null);
      refetch();
    } catch { setDeleting(false); }
  }

  const columns = [
    {
      key: 'name',
      label: 'Partner',
      render: (row) => (
        <div>
          <p className="font-medium text-ink/90 text-sm">{row.firstName} {row.lastName}</p>
          <p className="text-ink/40 text-[11px]">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'commitment',
      label: 'Monthly',
      render: (row) => <span className="font-display text-base text-ink font-light">{fmtAmt(row)}</span>,
    },
    {
      key: 'location',
      label: 'Location',
      render: (row) => (
        <span className="text-ink/60 text-sm">{[row.city, row.country].filter(Boolean).join(', ') || '—'}</span>
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
      key: 'createdAt',
      label: 'Applied',
      render: (row) => <span className="text-ink/60 text-xs">{fmtDate(row.createdAt)}</span>,
    },
  ];

  return (
    <AdminLayout title="Partners">
      <AdminPageHeader
        title="Partners"
        subtitle={`${total} partner${total !== 1 ? 's' : ''} · click a row to manage`}
      >
        <select
          className="input py-2 text-sm w-40"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </AdminPageHeader>

      <AdminTable columns={columns} rows={partners} loading={loading} empty="No partners match the filter." onRow={openDetail} />

      {/* Detail modal */}
      <AdminModal open={!!selected} onClose={() => setSelected(null)} title="Partner Details" size="lg">
        {selected && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-purple-brand/8">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-purple-brand/10 flex items-center justify-center text-purple-brand font-display font-semibold">
                  {selected.firstName[0]}
                </div>
                <div>
                  <p className="font-display text-lg text-ink font-light">{selected.firstName} {selected.lastName}</p>
                  <p className="text-ink/40 text-xs">Applied {fmtDate(selected.createdAt)}</p>
                </div>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[selected.status] ?? ''}`}>
                {selected.status}
              </span>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm font-body">
              <div className="flex items-center gap-2 text-ink/70"><Mail size={13} className="text-ink/40" /> {selected.email}</div>
              {selected.phone && <div className="flex items-center gap-2 text-ink/70"><Phone size={13} className="text-ink/40" /> {selected.phone}</div>}
              {(selected.city || selected.country) && <div className="flex items-center gap-2 text-ink/70"><Globe size={13} className="text-ink/40" /> {[selected.city, selected.country].filter(Boolean).join(', ')}</div>}
              <div className="flex items-center gap-2 text-ink/70"><DollarSign size={13} className="text-ink/40" /> {fmtAmt(selected)} / month</div>
            </div>

            {selected.motivation && (
              <FormField label="Why they want to partner">
                <div className="rounded-lg bg-cream/40 border border-purple-brand/8 p-4 text-sm text-ink/80 font-body leading-relaxed whitespace-pre-wrap">
                  {selected.motivation}
                </div>
              </FormField>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Status">
                <select className="input" value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="PENDING">PENDING</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </FormField>
              {selected.accountActivatedAt && (
                <FormField label="Account Activated">
                  <p className="text-sm text-ink/70 mt-2">{fmtDate(selected.accountActivatedAt)}</p>
                </FormField>
              )}
            </div>

            <FormField label="Admin Notes" hint="Internal only">
              <textarea
                className="input min-h-[80px] resize-y"
                value={editForm.adminNotes}
                onChange={(e) => setEditForm((f) => ({ ...f, adminNotes: e.target.value }))}
              />
            </FormField>

            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-purple-brand/8">
              {selected.status === 'PENDING' && (
                <button
                  onClick={handleActivate}
                  disabled={activating}
                  className="btn-primary text-sm px-5 py-2 disabled:opacity-60"
                >
                  {activating ? 'Activating…' : <><CheckCircle size={14} /> Activate Account & Send Credentials</>}
                </button>
              )}
              <button onClick={handleSave} disabled={saving} className="btn-outline text-sm px-4 py-2 disabled:opacity-60">
                {saving ? 'Saving…' : <><Check size={14} /> Save Changes</>}
              </button>
              <button onClick={() => { setDeleteTarget(selected); setSelected(null); }} className="text-sm px-3 py-2 text-red-500 hover:bg-red-50 rounded transition-colors font-body flex items-center gap-1.5 ml-auto">
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        )}
      </AdminModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Partner"
        message={`"${deleteTarget?.firstName} ${deleteTarget?.lastName}" will be permanently removed.`}
      />
    </AdminLayout>
  );
}
