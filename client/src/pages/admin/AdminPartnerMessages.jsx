import { useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, BookOpen, X, Check, Eye, EyeOff } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import RichTextEditor from '../../components/admin/RichTextEditor';

const EMPTY = { title: '', body: '', isPublished: false };
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminPartnerMessages() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getPartnerMessages(), []);
  const { data: rawData = [], loading, refetch } = useApi(fetchFn);
  const messages = Array.isArray(rawData) ? rawData : [];

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY);
    setError('');
    setModalOpen(true);
  }

  function openEdit(m) {
    setEditTarget(m);
    setForm({ title: m.title, body: m.body, isPublished: m.isPublished });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.body.trim())  { setError('Message body is required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await adminApi.updatePartnerMessage(editTarget.id, form);
      } else {
        await adminApi.createPartnerMessage(form);
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
      await adminApi.deletePartnerMessage(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch { setDeleting(false); }
  }

  async function togglePublish(msg) {
    try {
      await adminApi.updatePartnerMessage(msg.id, { isPublished: !msg.isPublished });
      refetch();
    } catch { /* silent */ }
  }

  return (
    <AdminLayout title="Partner Messages">
      <AdminPageHeader
        title="Partner Messages"
        subtitle={`${messages.filter((m) => m.isPublished).length} published · ${messages.filter((m) => !m.isPublished).length} draft`}
        action={{ label: 'New Message', icon: Plus, onClick: openCreate }}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-purple-brand/8 h-20 animate-pulse" />)}
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-xl border border-purple-brand/8 py-16 text-center">
          <BookOpen size={32} className="mx-auto mb-3 text-ink/20" />
          <p className="text-ink/35 font-body text-sm">No messages yet. Write the first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className={`bg-white rounded-xl border border-purple-brand/8 flex items-center gap-4 px-5 py-4 ${!msg.isPublished ? 'opacity-70' : ''}`}>
              <div className="w-10 h-10 rounded-full bg-purple-brand/10 flex items-center justify-center flex-shrink-0">
                <BookOpen size={16} className="text-purple-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink/90 text-sm truncate">{msg.title}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-ink/40 text-[11px] font-body">{fmtDate(msg.createdAt)}</span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${msg.isPublished ? 'bg-green-50 text-green-700' : 'bg-ink/5 text-ink/40'}`}>
                    {msg.isPublished ? 'Published' : 'Draft'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => togglePublish(msg)}
                  className={`p-1.5 rounded transition-colors ${msg.isPublished ? 'text-green-600 hover:bg-green-50' : 'text-ink/30 hover:text-green-600'}`}
                  title={msg.isPublished ? 'Unpublish' : 'Publish'}
                >
                  {msg.isPublished ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button onClick={() => openEdit(msg)} className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors" title="Edit">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setDeleteTarget(msg)} className="p-1.5 text-ink/30 hover:text-red-500 rounded transition-colors" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Message' : 'New Message'} size="lg">
        <div className="space-y-4">
          <FormField label="Title" required>
            <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </FormField>
          <RichTextEditor
            label="Message"
            value={form.body}
            onChange={(v) => setForm((f) => ({ ...f, body: v }))}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-purple-brand"
              checked={form.isPublished}
              onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
            />
            <span className="text-sm font-body text-ink/70">Publish immediately (visible to all active partners)</span>
          </label>
        </div>
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2"><X size={14} /> Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {editTarget ? 'Save Changes' : 'Create Message'}</>}
          </button>
        </div>
      </AdminModal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} loading={deleting} title="Delete Message" message={`"${deleteTarget?.title}" will be permanently removed from all partner portals.`} />
    </AdminLayout>
  );
}
