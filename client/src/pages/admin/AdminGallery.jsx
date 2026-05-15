import { useState, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Pencil, Images, Upload, X,
  ChevronDown, ChevronUp, ImageOff, Star,
} from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import Toggle from '../../components/admin/Toggle';

// ─── Album form ───────────────────────────────────────────────────────────────
function AlbumForm({ form, setForm }) {
  return (
    <div className="space-y-4">
      <FormField label="Album Name" required>
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </FormField>
      <FormField label="Description">
        <textarea
          className="input min-h-[70px] resize-y"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Event Date">
          <input
            type="date"
            className="input"
            value={form.eventDate}
            onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
          />
        </FormField>
        <FormField label="Cover Image URL" hint="Auto-set from first uploaded photo">
          <input
            className="input"
            placeholder="https://..."
            value={form.coverImage}
            onChange={(e) => setForm((f) => ({ ...f, coverImage: e.target.value }))}
          />
        </FormField>
      </div>
      <Toggle
        checked={form.isPublished}
        onChange={(v) => setForm((f) => ({ ...f, isPublished: v }))}
        label="Published"
      />
    </div>
  );
}

// ─── Photo manager (expands inline below album row) ───────────────────────────
function PhotoManager({ album, onClose, onAlbumUpdated }) {
  const fileRef   = useRef(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadErr, setUploadErr]       = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [editCaption, setEditCaption]   = useState(null); // { id, caption }
  const [savingCaption, setSavingCaption] = useState(false);

  const fetchPhotos = useCallback(
    () => adminApi.getPhotos(album.id),
    [album.id]
  );
  const { data: rawPhotos, loading, refetch } = useApi(fetchPhotos, [album.id]);
  const photos = Array.isArray(rawPhotos) ? rawPhotos : [];

  async function handleUpload(files) {
    if (!files?.length) return;
    setUploading(true);
    setUploadErr('');
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('photos', f));
      await adminApi.uploadPhotos(album.id, fd);
      refetch();
      onAlbumUpdated(); // refresh album list (cover may have changed)
    } catch (e) {
      setUploadErr(e.response?.data?.message ?? 'Upload failed. Check your Cloudinary config.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await adminApi.deletePhoto(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
      onAlbumUpdated();
    } catch {
      setDeleting(false);
    }
  }

  async function handleSetCover(photo) {
    try {
      await adminApi.updateAlbum(album.id, { coverImage: photo.url });
      onAlbumUpdated();
    } catch { /* silent */ }
  }

  async function handleSaveCaption() {
    setSavingCaption(true);
    try {
      await adminApi.updatePhoto(editCaption.id, { caption: editCaption.caption });
      setEditCaption(null);
      refetch();
    } catch { /* silent */ } finally {
      setSavingCaption(false);
    }
  }

  return (
    <div className="border-t border-purple-brand/8 bg-[#F9F8FC] px-5 py-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-body font-semibold text-ink/60">
          {photos.length} photo{photos.length !== 1 ? 's' : ''} in "{album.name}"
        </p>
        <button onClick={onClose} className="text-ink/30 hover:text-ink transition-colors">
          <ChevronUp size={16} />
        </button>
      </div>

      {/* Upload zone */}
      <div
        className="border-2 border-dashed border-purple-brand/20 rounded-lg p-5 mb-5 text-center cursor-pointer hover:border-purple-brand/40 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        <Upload size={20} className="mx-auto mb-2 text-purple-brand/40" />
        {uploading ? (
          <p className="text-sm font-body text-purple-brand">Uploading…</p>
        ) : (
          <p className="text-sm font-body text-ink/40">
            Drag & drop images here, or <span className="text-purple-brand underline">browse</span>
            <span className="block text-[11px] mt-0.5">Max 30 photos · 10 MB each</span>
          </p>
        )}
        {uploadErr && <p className="text-red-500 text-xs mt-2">{uploadErr}</p>}
      </div>

      {/* Photo grid */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square bg-purple-brand/8 rounded animate-pulse" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-ink/30">
          <ImageOff size={28} className="mb-2" />
          <p className="text-sm font-body">No photos yet — upload some above</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative">
              <img
                src={photo.url}
                alt={photo.caption ?? ''}
                className="w-full aspect-square object-cover rounded-lg"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center gap-1.5">
                <button
                  onClick={() => setEditCaption({ id: photo.id, caption: photo.caption ?? '' })}
                  className="text-white/80 hover:text-white text-[10px] font-body flex items-center gap-1"
                  title="Edit caption"
                >
                  <Pencil size={11} /> Caption
                </button>
                <button
                  onClick={() => handleSetCover(photo)}
                  className="text-white/80 hover:text-gold text-[10px] font-body flex items-center gap-1"
                  title="Set as cover"
                >
                  <Star size={11} /> Cover
                </button>
                <button
                  onClick={() => setDeleteTarget(photo)}
                  className="text-white/80 hover:text-red-400 text-[10px] font-body flex items-center gap-1"
                  title="Delete"
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
              {/* Cover badge */}
              {photo.url === album.coverImage && (
                <span className="absolute top-1 left-1 bg-gold text-purple-deep text-[9px] font-bold px-1.5 py-0.5 rounded">
                  Cover
                </span>
              )}
              {/* Caption pill */}
              {photo.caption && (
                <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1.5 py-0.5 truncate rounded-b-lg">
                  {photo.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Caption editor */}
      <AdminModal
        open={!!editCaption}
        onClose={() => setEditCaption(null)}
        title="Edit Caption"
        size="sm"
      >
        <FormField label="Caption">
          <input
            className="input"
            value={editCaption?.caption ?? ''}
            onChange={(e) => setEditCaption((c) => ({ ...c, caption: e.target.value }))}
            placeholder="Optional caption…"
          />
        </FormField>
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setEditCaption(null)} className="btn-outline text-sm px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleSaveCaption}
            disabled={savingCaption}
            className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
          >
            {savingCaption ? 'Saving…' : 'Save'}
          </button>
        </div>
      </AdminModal>

      {/* Delete photo confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Photo"
        message="This photo will be permanently removed from the album."
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const EMPTY_ALBUM = {
  name:        '',
  description: '',
  eventDate:   '',
  coverImage:  '',
  isPublished: false,
};

export default function AdminGallery() {
  const [albumModal, setAlbumModal]     = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_ALBUM);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [openAlbumId, setOpenAlbumId]   = useState(null);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getAlbums(), []);
  const { data: rawAlbums = [], loading, refetch } = useApi(fetchFn);
  const albums = Array.isArray(rawAlbums) ? rawAlbums : [];

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_ALBUM);
    setError('');
    setAlbumModal(true);
  }

  function openEdit(album) {
    setEditTarget(album);
    setForm({
      name:        album.name,
      description: album.description ?? '',
      eventDate:   album.eventDate?.slice(0, 10) ?? '',
      coverImage:  album.coverImage ?? '',
      isPublished: album.isPublished,
    });
    setError('');
    setAlbumModal(true);
  }

  async function handleSave() {
    if (!form.name) { setError('Album name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await adminApi.updateAlbum(editTarget.id, form);
      } else {
        await adminApi.createAlbum(form);
      }
      setAlbumModal(false);
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
      await adminApi.deleteAlbum(deleteTarget.id);
      setDeleteTarget(null);
      if (openAlbumId === deleteTarget.id) setOpenAlbumId(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout title="Gallery">
      <AdminPageHeader
        title="Gallery"
        subtitle={`${albums.length} album${albums.length !== 1 ? 's' : ''}`}
        action={{ label: 'New Album', icon: Plus, onClick: openCreate }}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-purple-brand/8 h-20 animate-pulse" />
          ))}
        </div>
      ) : albums.length === 0 ? (
        <div className="bg-white rounded-xl border border-purple-brand/8 py-16 text-center">
          <Images size={32} className="mx-auto mb-3 text-ink/20" />
          <p className="text-ink/35 font-body text-sm">No albums yet. Create your first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {albums.map((album) => {
            const isOpen = openAlbumId === album.id;
            return (
              <div key={album.id} className="bg-white rounded-xl border border-purple-brand/8 overflow-hidden">
                {/* Album row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Cover thumbnail */}
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-purple-brand/5 flex-shrink-0">
                    {album.coverImage
                      ? <img src={album.coverImage} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Images size={16} className="text-ink/20" /></div>}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink/90 text-sm">{album.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-ink/40 text-[11px]">
                        {album._count?.photos ?? 0} photo{album._count?.photos !== 1 ? 's' : ''}
                      </span>
                      {album.eventDate && (
                        <span className="text-ink/40 text-[11px]">
                          {new Date(album.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${album.isPublished ? 'bg-green-50 text-green-700' : 'bg-ink/5 text-ink/40'}`}>
                        {album.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setOpenAlbumId(isOpen ? null : album.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body text-purple-brand hover:bg-purple-brand/5 transition-colors"
                    >
                      <Images size={13} />
                      Photos
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <button
                      onClick={() => openEdit(album)}
                      className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors"
                      title="Edit album"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(album)}
                      className="p-1.5 text-ink/30 hover:text-red-500 rounded transition-colors"
                      title="Delete album"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Inline photo manager */}
                {isOpen && (
                  <PhotoManager
                    album={album}
                    onClose={() => setOpenAlbumId(null)}
                    onAlbumUpdated={refetch}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Album create/edit modal */}
      <AdminModal
        open={albumModal}
        onClose={() => setAlbumModal(false)}
        title={editTarget ? 'Edit Album' : 'New Album'}
        size="md"
      >
        <AlbumForm form={form} setForm={setForm} />
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setAlbumModal(false)} className="btn-outline text-sm px-5 py-2">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Album'}
          </button>
        </div>
      </AdminModal>

      {/* Delete album confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Album"
        message={`"${deleteTarget?.name}" and all its photos will be permanently removed.`}
      />
    </AdminLayout>
  );
}
