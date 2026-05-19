import { useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, Image as ImageIcon, Calendar, Video as YoutubeIcon, Home, X, Check } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import ImageUpload from '../../components/admin/ImageUpload';
import Toggle from '../../components/admin/Toggle';

const SLIDE_TYPES = [
  { value: 'IDENTITY', label: 'Identity (welcome)', icon: Home },
  { value: 'EVENT',    label: 'Featured event',     icon: Calendar },
  { value: 'YOUTUBE',  label: 'YouTube video',      icon: YoutubeIcon },
];

const EMPTY_FORM = {
  type:            'IDENTITY',
  isActive:        true,
  order:           '',
  headline:        '',
  subheadline:     '',
  body:            '',
  ctaPrimary:      '',
  ctaPrimaryUrl:   '',
  ctaSecondary:    '',
  ctaSecondaryUrl: '',
  imageUrl:        '',
  eventId:         '',
  youtubeMode:     'auto',
  manualYoutubeId: '',
};

function SlideForm({ form, setForm, events }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <FormField label="Slide Type" required>
            <select
              className="input"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              {SLIDE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Display Order" hint="Lower first">
          <input
            type="number"
            min="1"
            className="input"
            value={form.order}
            onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
          />
        </FormField>
      </div>

      <FormField label="Headline" required>
        <input
          className="input"
          value={form.headline}
          onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Subheadline">
          <input
            className="input"
            value={form.subheadline}
            onChange={(e) => setForm((f) => ({ ...f, subheadline: e.target.value }))}
          />
        </FormField>
        <ImageUpload
          label="Background Image"
          folder="hero"
          value={form.imageUrl}
          onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
        />
      </div>

      <FormField label="Body Text">
        <textarea
          className="input min-h-[70px] resize-y"
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
      </FormField>

      {/* CTAs */}
      <div className="rounded-lg border border-purple-brand/8 bg-cream/30 p-4 space-y-3">
        <p className="font-display text-sm text-ink/70">Call-to-Action Buttons</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Primary CTA Label" hint="e.g. Plan a Visit">
            <input
              className="input"
              value={form.ctaPrimary}
              onChange={(e) => setForm((f) => ({ ...f, ctaPrimary: e.target.value }))}
            />
          </FormField>
          <FormField label="Primary CTA URL">
            <input
              className="input"
              placeholder="/visit"
              value={form.ctaPrimaryUrl}
              onChange={(e) => setForm((f) => ({ ...f, ctaPrimaryUrl: e.target.value }))}
            />
          </FormField>
          <FormField label="Secondary CTA Label">
            <input
              className="input"
              value={form.ctaSecondary}
              onChange={(e) => setForm((f) => ({ ...f, ctaSecondary: e.target.value }))}
            />
          </FormField>
          <FormField label="Secondary CTA URL">
            <input
              className="input"
              value={form.ctaSecondaryUrl}
              onChange={(e) => setForm((f) => ({ ...f, ctaSecondaryUrl: e.target.value }))}
            />
          </FormField>
        </div>
      </div>

      {/* Type-specific */}
      {form.type === 'EVENT' && (
        <FormField label="Linked Event" hint="Pulls date, venue, and link from the event">
          <select
            className="input"
            value={form.eventId ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value || null }))}
          >
            <option value="">— Select an event —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({new Date(ev.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
              </option>
            ))}
          </select>
        </FormField>
      )}

      {form.type === 'YOUTUBE' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Video Source">
            <select
              className="input"
              value={form.youtubeMode ?? 'auto'}
              onChange={(e) => setForm((f) => ({ ...f, youtubeMode: e.target.value }))}
            >
              <option value="auto">Auto (latest from channel)</option>
              <option value="manual">Manual (specific video)</option>
            </select>
          </FormField>
          {form.youtubeMode === 'manual' && (
            <FormField label="YouTube Video ID" hint="The 11-char ID from the URL">
              <input
                className="input"
                placeholder="dQw4w9WgXcQ"
                value={form.manualYoutubeId}
                onChange={(e) => setForm((f) => ({ ...f, manualYoutubeId: e.target.value }))}
              />
            </FormField>
          )}
        </div>
      )}

      <Toggle
        checked={form.isActive}
        onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
        label="Active (show on homepage)"
      />
    </div>
  );
}

export default function AdminHero() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getHeroSlides(), []);
  const { data: rawSlides, loading, refetch } = useApi(fetchFn);
  const slides = Array.isArray(rawSlides) ? rawSlides : [];

  const fetchEventsFn = useCallback(() => adminApi.getEvents(), []);
  const { data: rawEvents } = useApi(fetchEventsFn);
  const events = Array.isArray(rawEvents) ? rawEvents : [];

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, order: slides.length + 1 });
    setError('');
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditTarget(row);
    setForm({
      type:            row.type,
      isActive:        row.isActive,
      order:           row.order,
      headline:        row.headline        ?? '',
      subheadline:     row.subheadline     ?? '',
      body:            row.body            ?? '',
      ctaPrimary:      row.ctaPrimary      ?? '',
      ctaPrimaryUrl:   row.ctaPrimaryUrl   ?? '',
      ctaSecondary:    row.ctaSecondary    ?? '',
      ctaSecondaryUrl: row.ctaSecondaryUrl ?? '',
      imageUrl:        row.imageUrl        ?? '',
      eventId:         row.eventId         ?? '',
      youtubeMode:     row.youtubeMode     ?? 'auto',
      manualYoutubeId: row.manualYoutubeId ?? '',
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.headline) {
      setError('Headline is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        order:   Number(form.order) || 0,
        eventId: form.type === 'EVENT' ? (form.eventId || null) : null,
      };
      if (editTarget) {
        await adminApi.updateHeroSlide(editTarget.id, payload);
      } else {
        await adminApi.createHeroSlide(payload);
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
      await adminApi.deleteHeroSlide(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  const typeMeta = (t) => SLIDE_TYPES.find((s) => s.value === t) ?? SLIDE_TYPES[0];

  return (
    <AdminLayout title="Hero / Home">
      <AdminPageHeader
        title="Hero Slides"
        subtitle={`${slides.length} slide${slides.length !== 1 ? 's' : ''} · shown in order on the homepage`}
        action={{ label: 'Add Slide', icon: Plus, onClick: openCreate }}
      />

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-purple-brand/8 h-48 animate-pulse" />
          ))}
        </div>
      ) : slides.length === 0 ? (
        <div className="bg-white rounded-xl border border-purple-brand/8 py-16 text-center">
          <ImageIcon size={32} className="mx-auto mb-3 text-ink/20" />
          <p className="text-ink/35 font-body text-sm">No slides yet. Create the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {slides.map((s) => {
            const Meta = typeMeta(s.type);
            const Icon = Meta.icon;
            return (
              <div key={s.id} className={`bg-white rounded-xl border border-purple-brand/8 overflow-hidden flex ${!s.isActive ? 'opacity-60' : ''}`}>
                {/* Image preview */}
                <div className="w-32 h-auto bg-cream/40 flex-shrink-0 relative">
                  {s.imageUrl ? (
                    <img src={s.imageUrl} alt={s.headline} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-ink/15">
                      <ImageIcon size={28} />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-4 min-w-0 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon size={14} className="text-purple-brand flex-shrink-0" />
                      <span className="text-[10px] uppercase tracking-wider text-ink/40 font-medium">
                        #{s.order} · {Meta.label}
                      </span>
                    </div>
                    {!s.isActive && (
                      <span className="bg-ink/5 text-ink/40 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>

                  <p className="font-display text-lg text-ink leading-tight font-light truncate">{s.headline}</p>
                  {s.subheadline && (
                    <p className="text-ink/50 text-xs font-body mt-0.5 truncate">{s.subheadline}</p>
                  )}
                  {s.body && (
                    <p className="text-ink/60 text-xs font-body mt-2 line-clamp-2">{s.body}</p>
                  )}

                  {(s.ctaPrimary || s.ctaSecondary) && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {s.ctaPrimary && (
                        <span className="bg-purple-brand/10 text-purple-brand text-[10px] px-2 py-0.5 rounded-full font-medium">
                          {s.ctaPrimary}
                        </span>
                      )}
                      {s.ctaSecondary && (
                        <span className="bg-ink/5 text-ink/50 text-[10px] px-2 py-0.5 rounded-full">
                          {s.ctaSecondary}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1 mt-auto pt-3 -mb-1">
                    <button
                      onClick={() => openEdit(s)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-body text-purple-brand hover:bg-purple-brand/5 transition-colors"
                    >
                      <Pencil size={11} /> Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(s)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-body text-ink/40 hover:text-red-500 hover:bg-red-50 transition-colors ml-auto"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Slide' : 'Add Slide'}
        size="lg"
      >
        <SlideForm form={form} setForm={setForm} events={events} />
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2">
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {editTarget ? 'Save Changes' : 'Add Slide'}</>}
          </button>
        </div>
      </AdminModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Slide"
        message={`"${deleteTarget?.headline}" will be permanently removed.`}
      />
    </AdminLayout>
  );
}
