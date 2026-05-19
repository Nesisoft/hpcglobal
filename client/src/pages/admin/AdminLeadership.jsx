import { useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, Users, Crown, Quote, X, Check } from 'lucide-react';
import { FaYoutube, FaFacebook, FaInstagram } from 'react-icons/fa';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import ImageUpload from '../../components/admin/ImageUpload';
import Toggle from '../../components/admin/Toggle';

const EMPTY_FORM = {
  name:         '',
  title:        '',
  role:         '',
  bio:          '',
  photo:        '',
  quote:        '',
  scripture:    '',
  youtubeUrl:   '',
  facebookUrl:  '',
  instagramUrl: '',
  isSenior:     false,
  order:        '',
  isActive:     true,
};

function ProfileForm({ form, setForm }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Full Name" required>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </FormField>
        <FormField label="Title" required hint="e.g. Prophet, Pastor, Minister">
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </FormField>
        <FormField label="Role" required hint="e.g. Senior Pastor, Worship Leader">
          <input
            className="input"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          />
        </FormField>
        <ImageUpload
          label="Photo"
          folder="leadership"
          value={form.photo}
          onChange={(url) => setForm((f) => ({ ...f, photo: url }))}
        />
      </div>

      <FormField label="Biography" required>
        <textarea
          className="input min-h-[100px] resize-y"
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Quote">
          <textarea
            className="input min-h-[60px] resize-y"
            placeholder="A signature quote or message…"
            value={form.quote}
            onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))}
          />
        </FormField>
        <FormField label="Favorite Scripture" hint="e.g. Psalm 23:1">
          <input
            className="input"
            value={form.scripture}
            onChange={(e) => setForm((f) => ({ ...f, scripture: e.target.value }))}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField label="YouTube URL">
          <input
            className="input"
            placeholder="https://youtube.com/..."
            value={form.youtubeUrl}
            onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
          />
        </FormField>
        <FormField label="Facebook URL">
          <input
            className="input"
            placeholder="https://facebook.com/..."
            value={form.facebookUrl}
            onChange={(e) => setForm((f) => ({ ...f, facebookUrl: e.target.value }))}
          />
        </FormField>
        <FormField label="Instagram URL">
          <input
            className="input"
            placeholder="https://instagram.com/..."
            value={form.instagramUrl}
            onChange={(e) => setForm((f) => ({ ...f, instagramUrl: e.target.value }))}
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
          checked={form.isSenior}
          onChange={(v) => setForm((f) => ({ ...f, isSenior: v }))}
          label="Senior leadership"
        />
        <Toggle
          checked={form.isActive}
          onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          label="Active (visible on site)"
        />
      </div>
    </div>
  );
}

export default function AdminLeadership() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getLeadership(), []);
  const { data: rawData = [], loading, refetch } = useApi(fetchFn);
  const profiles = Array.isArray(rawData) ? rawData : [];

  const senior = profiles.filter((p) => p.isSenior);
  const team   = profiles.filter((p) => !p.isSenior);

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, order: profiles.length + 1 });
    setError('');
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditTarget(row);
    setForm({
      name:         row.name,
      title:        row.title,
      role:         row.role,
      bio:          row.bio,
      photo:        row.photo        ?? '',
      quote:        row.quote        ?? '',
      scripture:    row.scripture    ?? '',
      youtubeUrl:   row.youtubeUrl   ?? '',
      facebookUrl:  row.facebookUrl  ?? '',
      instagramUrl: row.instagramUrl ?? '',
      isSenior:     row.isSenior,
      order:        row.order,
      isActive:     row.isActive,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.title || !form.role || !form.bio) {
      setError('Name, title, role, and bio are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, order: Number(form.order) || 0 };
      if (editTarget) {
        await adminApi.updateProfile(editTarget.id, payload);
      } else {
        await adminApi.createProfile(payload);
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
      await adminApi.deleteProfile(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  function ProfileCard({ p }) {
    return (
      <div className={`bg-white rounded-xl border border-purple-brand/8 p-5 flex flex-col ${!p.isActive ? 'opacity-60' : ''}`}>
        {/* Photo + name */}
        <div className="flex items-start gap-4 mb-4">
          {p.photo ? (
            <img src={p.photo} alt={p.name} className="w-16 h-16 rounded-full object-cover border-2 border-gold/30 flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-purple-brand/10 flex items-center justify-center text-purple-brand text-xl font-display flex-shrink-0">
              {p.name?.[0] ?? '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              {p.isSenior && <Crown size={12} className="text-gold flex-shrink-0" />}
              <p className="font-display text-lg text-ink leading-tight font-light truncate">{p.name}</p>
            </div>
            <p className="text-purple-brand text-xs font-body font-semibold">{p.title}</p>
            <p className="text-ink/50 text-[11px] font-body mt-0.5">{p.role}</p>
          </div>
          {!p.isActive && (
            <span className="bg-ink/5 text-ink/40 text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0">
              Inactive
            </span>
          )}
        </div>

        {/* Bio */}
        <p className="text-ink/60 font-body text-sm leading-relaxed line-clamp-3 flex-1 mb-3">
          {p.bio}
        </p>

        {/* Quote */}
        {p.quote && (
          <div className="bg-cream/50 border-l-2 border-gold p-3 mb-3 rounded-r">
            <Quote size={10} className="text-gold mb-1" />
            <p className="text-ink/60 text-xs font-body italic line-clamp-2">"{p.quote}"</p>
          </div>
        )}

        {/* Socials */}
        <div className="flex items-center gap-3 mb-3 text-ink/30">
          {p.youtubeUrl   && <a href={p.youtubeUrl}   target="_blank" rel="noopener noreferrer" className="hover:text-red-500"><FaYoutube   size={14} /></a>}
          {p.facebookUrl  && <a href={p.facebookUrl}  target="_blank" rel="noopener noreferrer" className="hover:text-blue-600"><FaFacebook  size={14} /></a>}
          {p.instagramUrl && <a href={p.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-pink-500"><FaInstagram size={14} /></a>}
          <span className="ml-auto text-[10px] font-body">#{p.order}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-3 border-t border-purple-brand/8 -mx-5 px-5 -mb-2">
          <button
            onClick={() => openEdit(p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body text-purple-brand hover:bg-purple-brand/5 transition-colors"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={() => setDeleteTarget(p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body text-ink/40 hover:text-red-500 hover:bg-red-50 transition-colors ml-auto"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout title="Leadership">
      <AdminPageHeader
        title="Leadership"
        subtitle={`${profiles.length} profile${profiles.length !== 1 ? 's' : ''}`}
        action={{ label: 'Add Profile', icon: Plus, onClick: openCreate }}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-purple-brand/8 h-64 animate-pulse" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="bg-white rounded-xl border border-purple-brand/8 py-16 text-center">
          <Users size={32} className="mx-auto mb-3 text-ink/20" />
          <p className="text-ink/35 font-body text-sm">No profiles yet. Add the first leader.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {senior.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Crown size={14} className="text-gold" />
                <h3 className="text-[11px] font-body font-semibold uppercase tracking-[0.18em] text-ink/50">
                  Senior Leadership
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {senior.map((p) => <ProfileCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
          {team.length > 0 && (
            <div>
              <h3 className="text-[11px] font-body font-semibold uppercase tracking-[0.18em] text-ink/50 mb-4">
                Team
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {team.map((p) => <ProfileCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Profile' : 'Add Profile'}
        size="lg"
      >
        <ProfileForm form={form} setForm={setForm} />
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2">
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {editTarget ? 'Save Changes' : 'Add Profile'}</>}
          </button>
        </div>
      </AdminModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Profile"
        message={`"${deleteTarget?.name}" will be permanently removed.`}
      />
    </AdminLayout>
  );
}
