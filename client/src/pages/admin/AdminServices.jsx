import { useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Pencil, Video, MapPin, Upload, X, Check } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import Toggle from '../../components/admin/Toggle';

const EMPTY_FORM = {
  name:       '',
  day:        '',
  timeGmt:    '',
  timeEst:    '',
  timeBst:    '',
  duration:   '',
  isOnline:   false,
  platform:   '',
  joinLink:   '',
  isStreamed: false,
  youtubeUrl: '',
  imageUrl:   '',
  order:      '',
  isActive:   true,
};

function ImageUploadField({ imageUrl, onFileSelect, uploading }) {
  const inputRef = useRef(null);
  return (
    <FormField label="Service Image" hint="Displayed on the home page service cards">
      <div className="flex items-start gap-3">
        {imageUrl ? (
          <div className="relative w-24 h-16 rounded overflow-hidden border border-purple-brand/15 flex-shrink-0">
            <img src={imageUrl} alt="Service" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-24 h-16 rounded border-2 border-dashed border-purple-brand/20 flex items-center justify-center flex-shrink-0 bg-cream">
            <Upload size={16} className="text-ink/30" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="btn-outline text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : <><Upload size={12} /> {imageUrl ? 'Change image' : 'Upload image'}</>}
          </button>
          {imageUrl && (
            <button
              type="button"
              onClick={() => setForm?.((f) => ({ ...f, imageUrl: '' }))}
              className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
            >
              <X size={11} /> Remove
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFileSelect(e.target.files[0])}
          />
        </div>
      </div>
    </FormField>
  );
}

function ServiceForm({ form, setForm, onFileSelect, uploading }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Service Name" required hint="e.g. Dominion Encounter">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </FormField>
        <FormField label="Day(s)" required hint="e.g. Sundays">
          <input
            className="input"
            placeholder="Sundays"
            value={form.day}
            onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
          />
        </FormField>
        <FormField label="Time (GMT)" required>
          <input
            className="input"
            placeholder="9:00 AM GMT"
            value={form.timeGmt}
            onChange={(e) => setForm((f) => ({ ...f, timeGmt: e.target.value }))}
          />
        </FormField>
        <FormField label="Time (EST)">
          <input
            className="input"
            placeholder="4:00 AM EST"
            value={form.timeEst}
            onChange={(e) => setForm((f) => ({ ...f, timeEst: e.target.value }))}
          />
        </FormField>
        <FormField label="Time (BST)">
          <input
            className="input"
            placeholder="10:00 AM BST"
            value={form.timeBst}
            onChange={(e) => setForm((f) => ({ ...f, timeBst: e.target.value }))}
          />
        </FormField>
        <FormField label="Duration" hint="e.g. ~2.5 hours">
          <input
            className="input"
            placeholder="~2.5 hours"
            value={form.duration}
            onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
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

      <div className="flex items-center gap-6 pt-1">
        <Toggle
          checked={form.isOnline}
          onChange={(v) => setForm((f) => ({ ...f, isOnline: v }))}
          label="Online service"
        />
        <Toggle
          checked={form.isStreamed}
          onChange={(v) => setForm((f) => ({ ...f, isStreamed: v }))}
          label="Streamed live"
        />
        <Toggle
          checked={form.isActive}
          onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          label="Active"
        />
      </div>

      {form.isOnline && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Platform" hint="e.g. Zoom">
            <input
              className="input"
              placeholder="Zoom"
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
            />
          </FormField>
          <FormField label="Join Link">
            <input
              className="input"
              placeholder="https://zoom.us/j/..."
              value={form.joinLink}
              onChange={(e) => setForm((f) => ({ ...f, joinLink: e.target.value }))}
            />
          </FormField>
        </div>
      )}

      {form.isStreamed && (
        <FormField label="YouTube Channel / Stream URL">
          <input
            className="input"
            placeholder="https://youtube.com/@prophetclottey"
            value={form.youtubeUrl}
            onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
          />
        </FormField>
      )}

      <ImageUploadField
        imageUrl={form.imageUrl}
        onFileSelect={onFileSelect}
        uploading={uploading}
        setForm={setForm}
      />
    </div>
  );
}

export default function AdminServices() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [pendingFile, setPendingFile]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getServiceTimes(), []);
  const { data: rawData = [], loading, refetch } = useApi(fetchFn);
  const services = Array.isArray(rawData) ? rawData : [];

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, order: services.length + 1 });
    setPendingFile(null);
    setError('');
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditTarget(row);
    setForm({
      name:       row.name,
      day:        row.day,
      timeGmt:    row.timeGmt,
      timeEst:    row.timeEst    ?? '',
      timeBst:    row.timeBst    ?? '',
      duration:   row.duration   ?? '',
      isOnline:   row.isOnline,
      platform:   row.platform   ?? '',
      joinLink:   row.joinLink   ?? '',
      isStreamed: row.isStreamed,
      youtubeUrl: row.youtubeUrl ?? '',
      imageUrl:   row.imageUrl   ?? '',
      order:      row.order,
      isActive:   row.isActive,
    });
    setPendingFile(null);
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.day || !form.timeGmt) {
      setError('Service name, day, and GMT time are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, order: Number(form.order) || 0 };
      let saved;
      if (editTarget) {
        const res = await adminApi.updateServiceTime(editTarget.id, payload);
        saved = res.data;
      } else {
        const res = await adminApi.createServiceTime(payload);
        saved = res.data;
      }
      // Upload image if one was selected
      if (pendingFile && saved?.id) {
        setUploading(true);
        const fd = new FormData();
        fd.append('image', pendingFile);
        await adminApi.uploadServiceTimeImage(saved.id, fd);
        setUploading(false);
      }
      setModalOpen(false);
      refetch();
    } catch (e) {
      setError(e.response?.data?.message ?? 'Save failed. Please try again.');
      setUploading(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await adminApi.deleteServiceTime(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Service',
      render: (row) => (
        <div>
          <p className="font-medium text-ink/90 text-sm">{row.name}</p>
          <p className="text-ink/40 text-[11px] mt-0.5">{row.day}</p>
        </div>
      ),
    },
    {
      key: 'timeGmt',
      label: 'Time',
      render: (row) => (
        <div>
          <p className="text-sm text-ink/80">{row.timeGmt}</p>
          {row.timeEst && <p className="text-[11px] text-ink/40">{row.timeEst}</p>}
        </div>
      ),
    },
    { key: 'duration', label: 'Duration', render: (row) => row.duration || '—' },
    {
      key: 'type',
      label: 'Type',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          {row.isOnline
            ? <><Video size={12} className="text-cyan-500" /><span className="text-[11px] text-ink/60">Online</span></>
            : <><MapPin size={12} className="text-purple-brand" /><span className="text-[11px] text-ink/60">In-person</span></>}
          {row.isStreamed && (
            <span className="ml-1 text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">Streamed</span>
          )}
        </div>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${row.isActive ? 'bg-green-50 text-green-700' : 'bg-ink/5 text-ink/40'}`}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { key: 'order', label: 'Order', render: (row) => `#${row.order}` },
    {
      key: '_actions',
      label: '',
      width: '80px',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(row); }}
            className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
            className="p-1.5 text-ink/30 hover:text-red-500 rounded transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout title="Services">
      <AdminPageHeader
        title="Services"
        subtitle="Manage service schedules — these populate the sermon service dropdown."
        action={{ label: 'Add Service', icon: Plus, onClick: openCreate }}
      />

      <AdminTable
        columns={columns}
        rows={services}
        loading={loading}
        empty="No services found. Add your first service time."
      />

      {/* Add / Edit modal */}
      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Service' : 'Add Service'}
        size="lg"
      >
        <ServiceForm
          form={form}
          setForm={setForm}
          onFileSelect={(file) => { setPendingFile(file); setForm((f) => ({ ...f, imageUrl: URL.createObjectURL(file) })); }}
          uploading={uploading}
        />
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2">
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {editTarget ? 'Save Changes' : 'Add Service'}</>}
          </button>
        </div>
      </AdminModal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Service"
        message={`"${deleteTarget?.name}" will be removed. Sermons linked to this service will lose their service label.`}
      />
    </AdminLayout>
  );
}
