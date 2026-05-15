import { useState, useCallback } from 'react';
import { Plus, Search, Trash2, Pencil, Users, MapPin, Video } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import Toggle from '../../components/admin/Toggle';

const CATEGORIES = ['SERVICE', 'CONFERENCE', 'YOUTH', 'WOMENS', 'MENS', 'ONLINE', 'OTHER'];

const CAT_LABELS = {
  SERVICE:    'Service',
  CONFERENCE: 'Conference',
  YOUTH:      'Youth',
  WOMENS:     "Women's",
  MENS:       "Men's",
  ONLINE:     'Online',
  OTHER:      'Other',
};

const CAT_COLORS = {
  SERVICE:    'bg-purple-brand/10 text-purple-brand',
  CONFERENCE: 'bg-gold/10 text-gold',
  YOUTH:      'bg-green-50 text-green-700',
  WOMENS:     'bg-pink-50 text-pink-600',
  MENS:       'bg-blue-50 text-blue-600',
  ONLINE:     'bg-cyan-50 text-cyan-700',
  OTHER:      'bg-ink/5 text-ink/50',
};

const EMPTY_FORM = {
  title:       '',
  description: '',
  startDate:   '',
  endDate:     '',
  timeGmt:     '',
  timeEst:     '',
  timeBst:     '',
  venue:       '',
  isOnline:    false,
  joinLink:    '',
  imageUrl:    '',
  category:    'SERVICE',
  isFeatured:  false,
  isPublished: false,
};

function EventForm({ form, setForm }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Title" required>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </FormField>
        <FormField label="Category" required>
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CAT_LABELS[c]}</option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="Description" required>
        <textarea
          className="input min-h-[90px] resize-y"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Start Date & Time" required>
          <input
            type="datetime-local"
            className="input"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </FormField>
        <FormField label="End Date & Time">
          <input
            type="datetime-local"
            className="input"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
        </FormField>
        <FormField label="Time (GMT)" required hint="e.g. 9:00 AM GMT">
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
        <FormField label="Image URL">
          <input
            className="input"
            placeholder="https://..."
            value={form.imageUrl}
            onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Venue" hint="Physical location (if any)">
          <input
            className="input"
            placeholder="Klagon Junction, Accra"
            value={form.venue}
            onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
          />
        </FormField>
        <FormField label="Stream / Join Link" hint="Zoom, YouTube, or online link">
          <input
            className="input"
            placeholder="https://zoom.us/j/..."
            value={form.joinLink}
            onChange={(e) => setForm((f) => ({ ...f, joinLink: e.target.value }))}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Toggle
          checked={form.isOnline}
          onChange={(v) => setForm((f) => ({ ...f, isOnline: v }))}
          label="Online / virtual event (no physical venue)"
        />
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

const RSVP_COLUMNS = [
  { key: 'name',       label: 'Name'       },
  { key: 'phone',      label: 'Phone'      },
  { key: 'email',      label: 'Email'      },
  { key: 'attendance', label: 'Attendance' },
  {
    key: 'createdAt',
    label: 'Registered',
    render: (row) => new Date(row.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  },
];

export default function AdminEvents() {
  const [search, setSearch]             = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [rsvpEvent, setRsvpEvent]       = useState(null);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getEvents(), []);
  const { data: rawEvents, loading, refetch } = useApi(fetchFn);
  const events = Array.isArray(rawEvents) ? rawEvents : (rawEvents?.events ?? []);

  const fetchRsvpsFn = useCallback(
    () => (rsvpEvent ? adminApi.getEventRsvps(rsvpEvent.id) : Promise.resolve({ data: [] })),
    [rsvpEvent]
  );
  const { data: rsvpData, loading: rsvpsLoading } = useApi(fetchRsvpsFn, [rsvpEvent]);
  const rsvps = Array.isArray(rsvpData) ? rsvpData : (rsvpData?.data ?? []);

  const filtered = events.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.title.toLowerCase().includes(q) || (e.venue ?? '').toLowerCase().includes(q);
    const matchCat = !filterCat || e.category === filterCat;
    return matchSearch && matchCat;
  });

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditTarget(row);
    setForm({
      title:       row.title,
      description: row.description,
      startDate:   row.startDate?.slice(0, 16) ?? '',
      endDate:     row.endDate?.slice(0, 16)   ?? '',
      timeGmt:     row.timeGmt    ?? '',
      timeEst:     row.timeEst    ?? '',
      timeBst:     row.timeBst    ?? '',
      venue:       row.venue      ?? '',
      isOnline:    row.isOnline,
      joinLink:    row.joinLink   ?? '',
      imageUrl:    row.imageUrl   ?? '',
      category:    row.category,
      isFeatured:  row.isFeatured,
      isPublished: row.isPublished,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title || !form.description || !form.startDate || !form.timeGmt) {
      setError('Title, description, start date, and GMT time are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await adminApi.updateEvent(editTarget.id, form);
      } else {
        await adminApi.createEvent(form);
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
      await adminApi.deleteEvent(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: 'title',
      label: 'Event',
      render: (row) => (
        <div>
          <p className="font-medium text-ink/90 text-sm leading-tight">{row.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {row.venue && (
              <span className="flex items-center gap-1 text-ink/40 text-[11px]">
                <MapPin size={10} /> {row.venue}
              </span>
            )}
            {row.joinLink && (
              <span className="flex items-center gap-1 text-ink/40 text-[11px]">
                <Video size={10} /> Online
              </span>
            )}
            {!row.venue && !row.joinLink && (
              <span className="text-ink/30 text-[11px]">—</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'startDate',
      label: 'Date',
      render: (row) => (
        <div>
          <p className="text-sm text-ink/80">
            {new Date(row.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-[11px] text-ink/40">{row.timeGmt}</p>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${CAT_COLORS[row.category] ?? CAT_COLORS.OTHER}`}>
          {CAT_LABELS[row.category] ?? row.category}
        </span>
      ),
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
    {
      key: '_actions',
      label: '',
      width: '120px',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setRsvpEvent(row); }}
            className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors"
            title="View RSVPs"
          >
            <Users size={14} />
          </button>
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
    <AdminLayout title="Events">
      <AdminPageHeader
        title="Events"
        subtitle={`${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}
        action={{ label: 'Add Event', icon: Plus, onClick: openCreate }}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              className="input pl-8 py-2 text-sm w-44"
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input py-2 text-sm w-36"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CAT_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </AdminPageHeader>

      <AdminTable
        columns={columns}
        rows={filtered}
        loading={loading}
        empty="No events yet. Click 'Add Event' to create one."
      />

      {/* Add / Edit modal */}
      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Event' : 'Add Event'}
        size="lg"
      >
        <EventForm form={form} setForm={setForm} />
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </AdminModal>

      {/* RSVPs viewer */}
      <AdminModal
        open={!!rsvpEvent}
        onClose={() => setRsvpEvent(null)}
        title={`RSVPs — ${rsvpEvent?.title ?? ''}`}
        size="xl"
      >
        <AdminTable
          columns={RSVP_COLUMNS}
          rows={rsvps}
          loading={rsvpsLoading}
          empty="No RSVPs for this event yet."
        />
        <div className="flex justify-end mt-4 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setRsvpEvent(null)} className="btn-outline text-sm px-5 py-2">
            Close
          </button>
        </div>
      </AdminModal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Event"
        message={`"${deleteTarget?.title}" and all its RSVPs will be permanently removed.`}
      />
    </AdminLayout>
  );
}
