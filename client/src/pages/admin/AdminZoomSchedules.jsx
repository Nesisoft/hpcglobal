import { useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, Video, X, Check, Calendar } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import Toggle from '../../components/admin/Toggle';

const EMPTY = { title: '', description: '', zoomLink: '', scheduledAt: '', isActive: true };
const fmtDate = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

export default function AdminZoomSchedules() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getZoomSchedules(), []);
  const { data: rawData = [], loading, refetch } = useApi(fetchFn);
  const schedules = Array.isArray(rawData) ? rawData : [];

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY);
    setError('');
    setModalOpen(true);
  }

  function openEdit(s) {
    setEditTarget(s);
    const local = new Date(s.scheduledAt);
    const pad = (n) => String(n).padStart(2, '0');
    const localDt = `${local.getFullYear()}-${pad(local.getMonth()+1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    setForm({ title: s.title, description: s.description ?? '', zoomLink: s.zoomLink, scheduledAt: localDt, isActive: s.isActive });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim())       { setError('Title is required.'); return; }
    if (!form.zoomLink.trim())    { setError('Zoom link is required.'); return; }
    if (!form.scheduledAt)        { setError('Date and time are required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await adminApi.updateZoomSchedule(editTarget.id, form);
      } else {
        await adminApi.createZoomSchedule(form);
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
      await adminApi.deleteZoomSchedule(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch { setDeleting(false); }
  }

  const upcoming = schedules.filter((s) => new Date(s.scheduledAt) >= new Date());
  const past     = schedules.filter((s) => new Date(s.scheduledAt) < new Date());

  return (
    <AdminLayout title="Zoom Schedules">
      <AdminPageHeader
        title="Partner Zoom Schedules"
        subtitle={`${upcoming.length} upcoming · ${past.length} past`}
        action={{ label: 'Add Session', icon: Plus, onClick: openCreate }}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-purple-brand/8 h-20 animate-pulse" />)}
        </div>
      ) : schedules.length === 0 ? (
        <div className="bg-white rounded-xl border border-purple-brand/8 py-16 text-center">
          <Video size={32} className="mx-auto mb-3 text-ink/20" />
          <p className="text-ink/35 font-body text-sm">No sessions yet. Add the first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.length > 0 && (
            <>
              <p className="text-xs font-body text-ink/40 uppercase tracking-wider pt-1 pb-1">Upcoming</p>
              {upcoming.map((s) => <ScheduleRow key={s.id} schedule={s} onEdit={openEdit} onDelete={setDeleteTarget} />)}
            </>
          )}
          {past.length > 0 && (
            <>
              <p className="text-xs font-body text-ink/40 uppercase tracking-wider pt-4 pb-1">Past</p>
              {past.map((s) => <ScheduleRow key={s.id} schedule={s} onEdit={openEdit} onDelete={setDeleteTarget} past />)}
            </>
          )}
        </div>
      )}

      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Session' : 'Add Zoom Session'} size="md">
        <div className="space-y-4">
          <FormField label="Title" required>
            <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <textarea className="input min-h-[70px] resize-y" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </FormField>
          <FormField label="Zoom Link" required hint="https://zoom.us/j/...">
            <input className="input" placeholder="https://zoom.us/j/..." value={form.zoomLink} onChange={(e) => setForm((f) => ({ ...f, zoomLink: e.target.value }))} />
          </FormField>
          <FormField label="Date & Time" required hint="Saved in server timezone (UTC)">
            <input type="datetime-local" className="input" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
          </FormField>
          <Toggle checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} label="Active (visible to partners)" />
        </div>
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2"><X size={14} /> Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {editTarget ? 'Save Changes' : 'Add Session'}</>}
          </button>
        </div>
      </AdminModal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} loading={deleting} title="Delete Session" message={`"${deleteTarget?.title}" will be permanently removed.`} />
    </AdminLayout>
  );
}

function ScheduleRow({ schedule, onEdit, onDelete, past }) {
  return (
    <div className={`bg-white rounded-xl border border-purple-brand/8 flex items-center gap-4 px-5 py-4 ${past ? 'opacity-60' : ''}`}>
      <div className="w-10 h-10 rounded-full bg-purple-brand/10 flex items-center justify-center flex-shrink-0">
        <Video size={16} className="text-purple-brand" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-ink/90 text-sm">{schedule.title}</p>
        <p className="text-ink/45 text-xs font-body mt-0.5 flex items-center gap-1.5">
          <Calendar size={10} />
          {new Date(schedule.scheduledAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {!schedule.isActive && <span className="bg-ink/5 text-ink/40 px-1.5 py-0.5 rounded-full text-[9px] font-medium ml-1">Hidden</span>}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onEdit(schedule)} className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors" title="Edit">
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(schedule)} className="p-1.5 text-ink/30 hover:text-red-500 rounded transition-colors" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
