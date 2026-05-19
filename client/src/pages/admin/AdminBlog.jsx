import { useState, useCallback } from 'react';
import { Plus, Search, Trash2, Pencil, ExternalLink, Clock, X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';
import ImageUpload from '../../components/admin/ImageUpload';
import Toggle from '../../components/admin/Toggle';

const CATEGORIES = [
  'DEVOTIONAL', 'PROPHETIC_WORD', 'SERMON_NOTES', 'TEACHING',
  'TESTIMONY', 'EVENT_RECAP', 'ANNOUNCEMENT',
];

const CAT_LABELS = {
  DEVOTIONAL:     'Devotional',
  PROPHETIC_WORD: 'Prophetic Word',
  SERMON_NOTES:   'Sermon Notes',
  TEACHING:       'Teaching',
  TESTIMONY:      'Testimony',
  EVENT_RECAP:    'Event Recap',
  ANNOUNCEMENT:   'Announcement',
};

const CAT_COLORS = {
  DEVOTIONAL:     'bg-purple-brand/10 text-purple-brand',
  PROPHETIC_WORD: 'bg-gold/10 text-gold',
  SERMON_NOTES:   'bg-blue-50 text-blue-600',
  TEACHING:       'bg-green-50 text-green-700',
  TESTIMONY:      'bg-pink-50 text-pink-600',
  EVENT_RECAP:    'bg-cyan-50 text-cyan-700',
  ANNOUNCEMENT:   'bg-amber-50 text-amber-600',
};

const EMPTY_FORM = {
  title:         '',
  excerpt:       '',
  content:       '',
  category:      'DEVOTIONAL',
  featuredImage: '',
  isPublished:   false,
};

function PostForm({ form, setForm }) {
  const wordCount = form.content.trim() ? form.content.trim().split(/\s+/).length : 0;
  const readTime  = Math.max(1, Math.round(wordCount / 200));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <FormField label="Title" required>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </FormField>
        </div>
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

      <ImageUpload
        label="Featured Image"
        folder="blog"
        value={form.featuredImage}
        onChange={(url) => setForm((f) => ({ ...f, featuredImage: url }))}
      />

      <FormField label="Excerpt" required hint="Short summary shown in listings (1-2 sentences)">
        <textarea
          className="input min-h-[60px] resize-y"
          maxLength={280}
          value={form.excerpt}
          onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
        />
      </FormField>

      <FormField
        label="Content"
        required
        hint={`${wordCount} words · ~${readTime} min read · Markdown supported`}
      >
        <textarea
          className="input min-h-[260px] resize-y font-mono text-[13px]"
          value={form.content}
          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
        />
      </FormField>

      <div className="flex items-center gap-6 pt-1">
        <Toggle
          checked={form.isPublished}
          onChange={(v) => setForm((f) => ({ ...f, isPublished: v }))}
          label="Published"
        />
      </div>
    </div>
  );
}

export default function AdminBlog() {
  const [search, setSearch]             = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [page, setPage]                 = useState(1);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(
    () => adminApi.getBlog({
      page, limit: 20,
      search:   search    || undefined,
      category: filterCat || undefined,
    }),
    [page, search, filterCat]
  );
  const { data, loading, refetch } = useApi(fetchFn, [page, search, filterCat]);
  const posts      = data?.posts ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditTarget(row);
    setForm({
      title:         row.title,
      excerpt:       row.excerpt,
      content:       row.content,
      category:      row.category,
      featuredImage: row.featuredImage ?? '',
      isPublished:   row.isPublished,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title || !form.excerpt || !form.content) {
      setError('Title, excerpt, and content are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await adminApi.updatePost(editTarget.id, form);
      } else {
        await adminApi.createPost(form);
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
      await adminApi.deletePost(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: 'featuredImage',
      label: '',
      width: '70px',
      render: (row) =>
        row.featuredImage
          ? <img src={row.featuredImage} alt="" className="w-14 h-9 object-cover rounded" />
          : <div className="w-14 h-9 bg-purple-brand/5 rounded" />,
    },
    {
      key: 'title',
      label: 'Title',
      render: (row) => (
        <div className="max-w-md">
          <p className="font-medium text-ink/90 text-sm leading-tight">{row.title}</p>
          <p className="text-ink/40 text-[11px] mt-0.5 truncate">{row.excerpt}</p>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${CAT_COLORS[row.category] ?? 'bg-ink/5 text-ink/50'}`}>
          {CAT_LABELS[row.category] ?? row.category}
        </span>
      ),
    },
    {
      key: 'author',
      label: 'Author',
      render: (row) => row.author?.name ?? '—',
    },
    {
      key: 'readTime',
      label: 'Read',
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-[11px] text-ink/50">
          <Clock size={10} /> {row.readTime ?? 1} min
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${row.isPublished ? 'bg-green-50 text-green-700' : 'bg-ink/5 text-ink/40'}`}>
          {row.isPublished ? 'Published' : 'Draft'}
        </span>
      ),
    },
    {
      key: '_actions',
      label: '',
      width: '110px',
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.isPublished && (
            <a
              href={`/blog/${row.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 text-ink/30 hover:text-purple-brand rounded transition-colors"
              title="View post"
            >
              <ExternalLink size={14} />
            </a>
          )}
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
    <AdminLayout title="Blog">
      <AdminPageHeader
        title="Blog"
        subtitle={`${total} post${total !== 1 ? 's' : ''}`}
        action={{ label: 'New Post', icon: Plus, onClick: openCreate }}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              className="input pl-8 py-2 text-sm w-44"
              placeholder="Search posts…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="input py-2 text-sm w-36"
            value={filterCat}
            onChange={(e) => { setFilterCat(e.target.value); setPage(1); }}
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
        rows={posts}
        loading={loading}
        empty="No posts yet. Click 'New Post' to write your first one."
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

      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Post' : 'New Post'}
        size="xl"
      >
        <PostForm form={form} setForm={setForm} />
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2">
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {editTarget ? 'Save Changes' : 'Create Post'}</>}
          </button>
        </div>
      </AdminModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Post"
        message={`"${deleteTarget?.title}" will be permanently removed.`}
      />
    </AdminLayout>
  );
}
