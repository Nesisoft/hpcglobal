import { useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, Church, MessageCircle, Mail, Calendar } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import Toggle from '../../components/admin/Toggle';

const ICON_OPTIONS = [
  'Users', 'Church', 'Music', 'BookOpen', 'Heart', 'HandHeart',
  'Mic2', 'Globe', 'GraduationCap', 'Baby', 'Sparkles', 'Cross',
];

const EMPTY_FORM = {
  name:        '',
  description: '',
  vision:      '',
  leader:      '',
  leaderPhoto: '',
  meetingDay:  '',
  meetingTime: '',
  icon:        'Users',
  whatsapp:    '',
  email:       '',
  order:       '',
  isActive:    true,
};

function MinistryForm({ form, setForm }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <FormField label="Ministry Name" required>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>
        </div>
        <FormField label="Icon">
          <select
            className="input"
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
          >
            {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </FormField>
      </div>

      <FormField label="Description" required>
        <textarea
          className="input min-h-[70px] resize-y"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </FormField>

      <FormField label="Vision">
        <textarea
          className="input min-h-[60px] resize-y"
          value={form.vision}
          onChange={(e) => setForm((f) => ({ ...f, vision: e.target.value }))}
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Leader Name" required>
          <input
            className="input"
            value={form.leader}
            onChange={(e) => setForm((f) => ({ ...f, leader: e.target.value }))}
          />
        </FormField>
        <FormField label="Leader Photo URL">
          <input
            className="input"
            placeholder="https://..."
            value={form.leaderPhoto}
            onChange={(e) => setForm((f) => ({ ...f, leaderPhoto: e.target.value }))}
          />
        </FormField>
        <FormField label="Meeting Day" hint="e.g. Wednesdays">
          <input
            className="input"
            value={form.meetingDay}
            onChange={(e) => setForm((f) => ({ ...f, meetingDay: e.target.value }))}
          />
        </FormField>
        <FormField label="Meeting Time" hint="e.g. 6:00 PM">
          <input
            className="input"
            value={form.meetingTime}
            onChange={(e) => setForm((f) => ({ ...f, meetingTime: e.target.value }))}
          />
        </FormField>
        <FormField label="WhatsApp Number">
          <input
            className="input"
            placeholder="+233..."
            value={form.whatsapp}
            onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
          />
        </FormField>
        <FormField label="Email">
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </FormField>
        <FormField label="Display Order" hint="Lower numbers appear first">
          <input
            type="number"
            className="input"
            min="1"
            value={form.order}
            onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
          />
        </FormField>
      </div>

      <Toggle
        checked={form.isActive}
        onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
        label="Active (visible on site)"
      />
    </div>
  );
}

export default function AdminMinistries() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getMinistries(), []);
  const { data: rawData = [], loading, refetch } = useApi(fetchFn);
  const ministries = Array.isArray(rawData) ? rawData : [];

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, order: ministries.length + 1 });
    setError('');
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditTarget(row);
    setForm({
      name:        row.name,
      description: row.description,
      vision:      row.vision      ?? '',
      leader:      row.leader,
      leaderPhoto: row.leaderPhoto ?? '',
      meetingDay:  row.meetingDay  ?? '',
      meetingTime: row.meetingTime ?? '',
      icon:        row.icon        ?? 'Users',
      whatsapp:    row.whatsapp    ?? '',
      email:       row.email       ?? '',
      order:       row.order,
      isActive:    row.isActive,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.description || !form.leader) {
      setError('Name, description, and leader are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, order: Number(form.order) || 0 };
      if (editTarget) {
        await adminApi.updateMinistry(editTarget.id, payload);
      } else {
        await adminApi.createMinistry(payload);
      }
      setModalOpen(false);
      refetch();
    } catch (e) {
      setError(e.response?.data?.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await adminApi.deleteMinistry(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout title="Ministries">
      <AdminPageHeader
        title="Ministries"
        subtitle={`${ministries.length} ministr${ministries.length !== 1 ? 'ies' : 'y'}`}
        action={{ label: 'Add Ministry', icon: Plus, onClick: openCreate }}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-purple-brand/8 h-44 animate-pulse" />
          ))}
        </div>
      ) : ministries.length === 0 ? (
        <div className="bg-white rounded-xl border border-purple-brand/8 py-16 text-center">
          <Church size={32} className="mx-auto mb-3 text-ink/20" />
          <p className="text-ink/35 font-body text-sm">No ministries yet. Create the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ministries.map((m) => (
            <div key={m.id} className={`bg-white rounded-xl border border-purple-brand/8 p-5 flex flex-col ${!m.isActive ? 'opacity-60' : ''}`}>
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-brand/10 flex items-center justify-center text-purple-brand">
                    <Church size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-lg text-ink leading-tight font-light">{m.name}</p>
                    <p className="text-ink/40 text-[11px] mt-0.5">#{m.order} · {m.icon}</p>
                  </div>
                </div>
                {!m.isActive && (
                  <span className="bg-ink/5 text-ink/40 text-[10px] font-medium px-2 py-0.5 rounded-full">
                    Inactive
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-ink/60 font-body text-sm leading-relaxed line-clamp-3 flex-1 mb-4">
                {m.description}
              </p>

              {/* Leader */}
              <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-purple-brand/8">
                {m.leaderPhoto ? (
                  <img src={m.leaderPhoto} alt={m.leader} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-brand/10 flex items-center justify-center text-purple-brand text-xs font-semibold">
                    {m.leader?.[0] ?? '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-ink/70 text-xs font-body font-medium truncate">{m.leader}</p>
                  <p className="text-ink/30 text-[10px] uppercase tracking-wider">Leader</p>
                </div>
              </div>

              {/* Meta */}
              <div className="space-y-1 mb-4 text-[11px] text-ink/50 font-body">
                {(m.meetingDay || m.meetingTime) && (
                  <div className="flex items-center gap-1.5">
                    <Calendar size={11} />
                    <span>{[m.meetingDay, m.meetingTime].filter(Boolean).join(' · ')}</span>
                  </div>
                )}
                {m.whatsapp && (
                  <div className="flex items-center gap-1.5">
                    <MessageCircle size={11} />
                    <span>{m.whatsapp}</span>
                  </div>
                )}
                {m.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail size={11} />
                    <span className="truncate">{m.email}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 pt-2 border-t border-purple-brand/8 -mx-5 px-5 -mb-2">
                <button
                  onClick={() => openEdit(m)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body text-purple-brand hover:bg-purple-brand/5 transition-colors"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(m)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body text-ink/40 hover:text-red-500 hover:bg-red-50 transition-colors ml-auto"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Ministry' : 'Add Ministry'}
        size="lg"
      >
        <MinistryForm form={form} setForm={setForm} />
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Ministry'}
          </button>
        </div>
      </AdminModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Ministry"
        message={`"${deleteTarget?.name}" will be permanently removed.`}
      />
    </AdminLayout>
  );
}
