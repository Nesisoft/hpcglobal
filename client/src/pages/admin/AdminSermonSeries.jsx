import { useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, Library, X, Check } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import ImageUpload from '../../components/admin/ImageUpload';
import SortableGrid from '../../components/admin/SortableGrid';
import Toggle from '../../components/admin/Toggle';

const EMPTY_FORM = { name: '', description: '', coverImage: '', isActive: true };

export default function AdminSermonSeries() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getSermonSeries(), []);
  const { data: rawData = [], loading, refetch } = useApi(fetchFn);
  const series = Array.isArray(rawData) ? rawData : [];

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function openEdit(s) {
    setEditTarget(s);
    setForm({
      name:        s.name,
      description: s.description ?? '',
      coverImage:  s.coverImage  ?? '',
      isActive:    s.isActive,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Series name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await adminApi.updateSermonSeries(editTarget.id, form);
      } else {
        await adminApi.createSermonSeries(form);
      }
      setModalOpen(false);
      refetch();
    } catch (e) {
      setError(e.response?.data?.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReorder(ids) {
    try {
      await adminApi.reorderSermonSeries(ids);
      refetch();
    } catch {
      refetch();
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await adminApi.deleteSermonSeries(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout title="Sermon Series">
      <AdminPageHeader
        title="Sermon Series"
        subtitle={`${series.length} series · drag to reorder`}
        action={{ label: 'Add Series', icon: Plus, onClick: openCreate }}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-purple-brand/8 h-48 animate-pulse" />
          ))}
        </div>
      ) : series.length === 0 ? (
        <div className="bg-white rounded-xl border border-purple-brand/8 py-16 text-center">
          <Library size={32} className="mx-auto mb-3 text-ink/20" />
          <p className="text-ink/35 font-body text-sm">No series yet. Create the first one.</p>
        </div>
      ) : (
        <SortableGrid
          items={series}
          onReorder={handleReorder}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          renderItem={(s) => (
            <div className={`bg-white rounded-xl border border-purple-brand/8 overflow-hidden flex flex-col ${!s.isActive ? 'opacity-60' : ''}`}>
              <div className="h-28 bg-cream/40 relative">
                {s.coverImage ? (
                  <img src={s.coverImage} alt={s.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-ink/15">
                    <Library size={28} />
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-display text-lg text-ink leading-tight font-light">{s.name}</p>
                  {!s.isActive && (
                    <span className="bg-ink/5 text-ink/40 text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-ink/55 font-body text-xs leading-relaxed line-clamp-3 flex-1">
                  {s.description || <span className="text-ink/25">No description</span>}
                </p>
                <div className="flex items-center gap-1 pt-3 mt-3 border-t border-purple-brand/8">
                  <button
                    onClick={() => openEdit(s)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body text-purple-brand hover:bg-purple-brand/5 transition-colors"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body text-ink/40 hover:text-red-500 hover:bg-red-50 transition-colors ml-auto"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        />
      )}

      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Series' : 'Add Series'}
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Series Name" required>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>
          <FormField label="Description">
            <textarea
              className="input min-h-[90px] resize-y"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>
          <ImageUpload
            label="Cover Image"
            folder="sermon-series"
            value={form.coverImage}
            onChange={(url) => setForm((f) => ({ ...f, coverImage: url }))}
          />
          <Toggle
            checked={form.isActive}
            onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            label="Active (visible on public site)"
          />
        </div>
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2">
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {editTarget ? 'Save Changes' : 'Add Series'}</>}
          </button>
        </div>
      </AdminModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Series"
        message={`"${deleteTarget?.name}" will be permanently removed. Sermons keep their series label.`}
      />
    </AdminLayout>
  );
}
