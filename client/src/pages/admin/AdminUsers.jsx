import { useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, ShieldCheck, Eye, EyeOff, X, Check, Building2 } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';

const ROLES = ['SUPER_ADMIN', 'CONTENT_EDITOR', 'MEDIA_MANAGER', 'HOD'];
const ROLE_COLORS = {
  SUPER_ADMIN:    'bg-purple-brand/10 text-purple-brand',
  CONTENT_EDITOR: 'bg-gold/10 text-gold',
  MEDIA_MANAGER:  'bg-blue-50 text-blue-600',
  HOD:            'bg-teal-50 text-teal-700',
};
const ROLE_LABELS = {
  SUPER_ADMIN:    'Super Admin',
  CONTENT_EDITOR: 'Content Editor',
  MEDIA_MANAGER:  'Media Manager',
  HOD:            'Head of Department',
};

const EMPTY_FORM = { name: '', email: '', role: 'CONTENT_EDITOR', department: '', password: '', confirmPassword: '' };

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();

  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [showPw, setShowPw]             = useState(false);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  const fetchFn = useCallback(() => adminApi.getUsers(), []);
  const { data: rawUsers, loading, refetch } = useApi(fetchFn);
  const users = Array.isArray(rawUsers) ? rawUsers : [];

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowPw(false);
    setError('');
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditTarget(row);
    setForm({ name: row.name, email: row.email, role: row.role, department: row.department ?? '', password: '', confirmPassword: '' });
    setShowPw(false);
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.email) { setError('Name and email are required.'); return; }
    if (form.role === 'HOD' && !form.department.trim()) {
      setError('A head of department needs a department name.');
      return;
    }
    if (!editTarget && !form.password) { setError('Password is required for new users.'); return; }
    if (form.password && form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    if (form.password && form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setSaving(true); setError('');
    try {
      const payload = { name: form.name, email: form.email, role: form.role };
      // Only meaningful for HoDs; the server nulls it for the other roles anyway.
      if (form.role === 'HOD') payload.department = form.department.trim();
      if (form.password) payload.password = form.password;
      if (editTarget) {
        await adminApi.updateUser(editTarget.id, payload);
      } else {
        await adminApi.createUser(payload);
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
      await adminApi.deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'User',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-brand/10 flex items-center justify-center text-purple-brand text-xs font-semibold flex-shrink-0">
            {row.name?.[0] ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-ink/90 text-sm leading-tight flex items-center gap-1.5">
              {row.name}
              {row.id === currentUser?.id && (
                <span className="text-[9px] bg-gold/15 text-gold px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide">
                  You
                </span>
              )}
            </p>
            <p className="text-ink/40 text-[11px] truncate">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (row) => (
        <div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${ROLE_COLORS[row.role] ?? ''}`}>
            <ShieldCheck size={10} />
            {ROLE_LABELS[row.role] ?? row.role}
          </span>
          {row.role === 'HOD' && (
            <p className="text-ink/45 text-[11px] mt-1 flex items-center gap-1">
              <Building2 size={10} className="flex-shrink-0" />
              {row.department || <span className="text-red-500">No department set</span>}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'lastLogin',
      label: 'Last Login',
      render: (row) => <span className="text-ink/60 text-xs">{fmtDate(row.lastLogin)}</span>,
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (row) => <span className="text-ink/60 text-xs">{fmtDate(row.createdAt)}</span>,
    },
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
          {row.id !== currentUser?.id && (
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
              className="p-1.5 text-ink/30 hover:text-red-500 rounded transition-colors"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout title="Admin Users">
      <AdminPageHeader
        title="Admin Users"
        subtitle={`${users.length} user${users.length !== 1 ? 's' : ''} · SUPER_ADMIN access only`}
        action={{ label: 'Add User', icon: Plus, onClick: openCreate }}
      />

      <div className="bg-white rounded-xl border border-purple-brand/8 p-4 mb-5 text-xs font-body text-ink/60 space-y-1">
        <p><strong className="text-purple-brand">Super Admin</strong> — full access to all modules including giving, prayer, settings, and user management.</p>
        <p><strong className="text-gold">Content Editor</strong> — can manage sermons, events, blog, gallery, ministries, leadership, about, and hero.</p>
        <p><strong className="text-blue-600">Media Manager</strong> — can manage gallery albums and photos only.</p>
        <p><strong className="text-teal-700">Head of Department</strong> — no access to any content module. Signs in to the reporting portal to file department reports, which appear under Dept. Reports.</p>
      </div>

      <AdminTable
        columns={columns}
        rows={users}
        loading={loading}
        empty="No admin users found."
      />

      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit User' : 'Add Admin User'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Full Name" required>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </FormField>
            <FormField label="Email" required>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Role" required>
              <select
                className="input"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </FormField>
            {/* Only a head of department has one, and their reports are grouped
                by it, so it is required for that role. */}
            {form.role === 'HOD' && (
              <FormField label="Department" hint="e.g. Ushering, Choir, Children's Church" required>
                <input
                  className="input"
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  placeholder="Department name"
                />
              </FormField>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-purple-brand/8">
            <FormField label={editTarget ? 'New Password' : 'Password'} hint={editTarget ? 'Leave blank to keep current' : undefined} required={!editTarget}>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-9"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </FormField>
            <FormField label="Confirm Password">
              <input
                type={showPw ? 'text' : 'password'}
                className="input"
                value={form.confirmPassword}
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                autoComplete="new-password"
              />
            </FormField>
          </div>
        </div>

        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2">
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {editTarget ? 'Save Changes' : 'Create User'}</>}
          </button>
        </div>
      </AdminModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete User"
        message={`"${deleteTarget?.name}" will lose all admin access. This cannot be undone.`}
        danger
      />
    </AdminLayout>
  );
}
