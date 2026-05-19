import { useState, useCallback } from 'react';
import { Plus, Search, Trash2, Pencil, ExternalLink, X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { FaYoutube } from 'react-icons/fa';
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
  youtubeUrl:    '',
  youtubeId:     '',
  thumbnailUrl:  '',
  title:         '',
  preacher:      '',
  series:        '',
  scripture:     '',
  serviceType:   '',
  duration:      '',
  datePracticed: '',
  isPublished:   true,
  isFeatured:    false,
};

// Extract YouTube video ID from any URL format or bare ID
function extractYoutubeId(value) {
  const match = value.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(value.trim())) return value.trim();
  return null;
}

function SermonForm({ form, setForm, onYoutubeLookup, lookingUp, serviceTimes, seriesList }) {
  function handleUrlChange(e) {
    const url = e.target.value;
    const id  = extractYoutubeId(url);
    setForm((f) => ({
      ...f,
      youtubeUrl:   url,
      youtubeId:    id ?? f.youtubeId,
      thumbnailUrl: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : f.thumbnailUrl,
    }));
  }

  return (
    <div className="space-y-4">
      <FormField label="YouTube URL or Video ID" required hint="Paste the URL then click Autofill to fetch title & duration">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="https://youtube.com/watch?v=..."
            value={form.youtubeUrl}
            onChange={handleUrlChange}
          />
          <button
            type="button"
            onClick={onYoutubeLookup}
            disabled={!form.youtubeId || lookingUp}
            className="btn-primary text-xs px-3 py-2 whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
          >
            <FaYoutube size={13} />
            {lookingUp ? 'Fetching…' : 'Autofill'}
          </button>
        </div>
      </FormField>

      {form.thumbnailUrl && (
        <img
          src={form.thumbnailUrl}
          alt="thumbnail"
          className="w-full h-40 object-cover rounded-lg border border-purple-brand/10"
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Title" required>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </FormField>
        <FormField label="Preacher" required>
          <input
            className="input"
            value={form.preacher}
            onChange={(e) => setForm((f) => ({ ...f, preacher: e.target.value }))}
          />
        </FormField>
        <FormField label="Series" hint="Type or pick a managed series">
          <input
            className="input"
            list="sermon-series-options"
            placeholder="e.g. Dominion Series"
            value={form.series}
            onChange={(e) => setForm((f) => ({ ...f, series: e.target.value }))}
          />
          <datalist id="sermon-series-options">
            {seriesList.map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
        </FormField>
        <FormField label="Scripture">
          <input
            className="input"
            placeholder="e.g. John 3:16"
            value={form.scripture}
            onChange={(e) => setForm((f) => ({ ...f, scripture: e.target.value }))}
          />
        </FormField>
        <FormField label="Service">
          <select
            className="input"
            value={form.serviceType}
            onChange={(e) => setForm((f) => ({ ...f, serviceType: e.target.value }))}
          >
            <option value="">— Select service —</option>
            {serviceTimes.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Duration" hint="Auto-filled by Autofill">
          <input
            className="input"
            placeholder="e.g. 1h 24m"
            value={form.duration}
            onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
          />
        </FormField>
        <FormField label="Date Preached" required>
          <input
            type="date"
            className="input"
            value={form.datePracticed}
            onChange={(e) => setForm((f) => ({ ...f, datePracticed: e.target.value }))}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-6 pt-1">
        <Toggle
          checked={form.isPublished}
          onChange={(v) => setForm((f) => ({ ...f, isPublished: v }))}
          label="Published"
        />
        <Toggle
          checked={form.isFeatured}
          onChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))}
          label="Featured"
        />
      </div>
    </div>
  );
}

const COLUMNS = [
  {
    key: 'thumbnailUrl',
    label: '',
    width: '80px',
    render: (row) => (
      <img src={row.thumbnailUrl} alt="" className="w-16 h-10 object-cover rounded" />
    ),
  },
  {
    key: 'title',
    label: 'Title',
    render: (row) => (
      <div>
        <p className="font-medium text-ink/90 text-sm leading-tight">{row.title}</p>
        {row.series && <p className="text-ink/40 text-[11px] mt-0.5">{row.series}</p>}
      </div>
    ),
  },
  { key: 'preacher', label: 'Preacher' },
  {
    key: 'serviceType',
    label: 'Service',
    render: (row) => row.serviceType || <span className="text-ink/30">—</span>,
  },
  {
    key: 'datePracticed',
    label: 'Date',
    render: (row) =>
      new Date(row.datePracticed).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      }),
  },
  {
    key: 'status',
    label: 'Status',
    render: (row) => (
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${row.isPublished ? 'bg-green-50 text-green-700' : 'bg-ink/5 text-ink/40'}`}>
          {row.isPublished ? 'Published' : 'Draft'}
        </span>
        {row.isFeatured && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gold/10 text-gold">
            Featured
          </span>
        )}
      </div>
    ),
  },
];

export default function AdminSermons() {
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [lookingUp, setLookingUp]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(
    () => adminApi.getSermons({ page, limit: 20, search: search || undefined }),
    [page, search]
  );
  const { data, loading, refetch } = useApi(fetchFn, [page, search]);
  const sermons    = data?.sermons ?? [];
  const total      = data?.total   ?? 0;
  const totalPages = Math.ceil(total / 20);

  const { data: serviceTimesData = [] } = useApi(adminApi.getServiceTimes);
  const serviceTimes = Array.isArray(serviceTimesData) ? serviceTimesData : [];

  const { data: seriesData = [] } = useApi(adminApi.getSermonSeries);
  const seriesList = Array.isArray(seriesData) ? seriesData : [];

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditTarget(row);
    setForm({
      youtubeUrl:    row.youtubeUrl,
      youtubeId:     row.youtubeId,
      thumbnailUrl:  row.thumbnailUrl,
      title:         row.title,
      preacher:      row.preacher,
      series:        row.series       ?? '',
      scripture:     row.scripture    ?? '',
      serviceType:   row.serviceType  ?? '',
      duration:      row.duration     ?? '',
      datePracticed: row.datePracticed?.slice(0, 10) ?? '',
      isPublished:   row.isPublished,
      isFeatured:    row.isFeatured,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleYoutubeLookup() {
    setLookingUp(true);
    setError('');
    try {
      const { data: meta } = await adminApi.getYoutubeMeta(form.youtubeUrl);
      setForm((f) => ({
        ...f,
        youtubeId:    meta.youtubeId,
        youtubeUrl:   meta.youtubeUrl,
        thumbnailUrl: meta.thumbnailUrl,
        title:        meta.title    || f.title,
        duration:     meta.duration || f.duration,
      }));
    } catch {
      setError('Could not fetch YouTube metadata. Check the URL and try again.');
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSave() {
    if (!form.title || !form.preacher || !form.youtubeId || !form.datePracticed) {
      setError('Title, preacher, YouTube URL, and date are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await adminApi.updateSermon(editTarget.id, form);
      } else {
        await adminApi.createSermon(form);
      }
      setModalOpen(false);
      refetch();
    } catch (e) {
      setError(e.response?.data?.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await adminApi.deleteSermon(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  const columns = [
    ...COLUMNS,
    {
      key: '_actions',
      label: '',
      width: '110px',
      render: (row) => (
        <div className="flex items-center gap-1">
          <a
            href={`https://youtube.com/watch?v=${row.youtubeId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors"
            title="Watch on YouTube"
          >
            <ExternalLink size={14} />
          </a>
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
    <AdminLayout title="Sermons">
      <AdminPageHeader
        title="Sermons"
        subtitle={`${total} sermon${total !== 1 ? 's' : ''} in the library`}
        action={{ label: 'Add Sermon', icon: Plus, onClick: openCreate }}
      >
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            className="input pl-8 py-2 text-sm w-56"
            placeholder="Search sermons…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </AdminPageHeader>

      <AdminTable
        columns={columns}
        rows={sermons}
        loading={loading}
        empty="No sermons yet. Click 'Add Sermon' to get started."
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-ink/40 font-body">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40"
            >
              <ChevronLeft size={13} /> Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
              className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Sermon' : 'Add Sermon'}
        size="lg"
      >
        <SermonForm
          form={form}
          setForm={setForm}
          onYoutubeLookup={handleYoutubeLookup}
          lookingUp={lookingUp}
          serviceTimes={serviceTimes}
          seriesList={seriesList}
        />
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2">
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {editTarget ? 'Save Changes' : 'Add Sermon'}</>}
          </button>
        </div>
      </AdminModal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Sermon"
        message={`"${deleteTarget?.title}" will be permanently removed from the library.`}
      />
    </AdminLayout>
  );
}
