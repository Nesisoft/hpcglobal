import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Archive, RotateCcw } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Empty, Field, Modal, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useForm } from '../../lib/useForm';

export default function Departments() {
  const [departments, setDepartments] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);   // a department, or {} for a new one
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try { setDepartments((await api.get('/admin/departments')).departments); } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setActive(d, active) {
    setError('');
    try { await api.patch(`/admin/departments/${d.id}`, { active }); await load(); } catch (err) { setError(err.message); }
  }

  const list = (departments || []).filter((d) => showArchived || d.active);
  const archivedCount = (departments || []).filter((d) => !d.active).length;

  return (
    <AppShell title="Departments">
      <PageHeader title="Departments" subtitle="Workers choose one of these when they sign up.">
        <button className="btn-primary px-4 py-2.5" onClick={() => setEditing({})}><Plus size={15} /> Add department</button>
      </PageHeader>
      <div className="mb-4"><Alert>{error}</Alert></div>

      {!departments ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : list.length === 0 ? (
        <Empty>No departments yet.</Empty>
      ) : (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((d) => (
            <li key={d.id} className={`card p-5 flex flex-col ${d.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-2xl text-ink leading-tight">{d.name}</h2>
                {!d.active && <span className="text-[11px] font-body text-ink/45 uppercase tracking-wider pt-1.5">Archived</span>}
              </div>
              {d.description && <p className="text-sm font-body text-ink/50 mt-1">{d.description}</p>}
              <div className="mt-3 text-sm font-body text-ink/65 space-y-0.5 flex-1">
                <p>
                  <Link to={`/admin/workers?department=${d.id}&status=ACTIVE`} className="hover:text-purple-brand">{d.activeMembers} member{d.activeMembers === 1 ? '' : 's'}</Link>
                  {d.pendingMembers > 0 && (
                    <Link to={`/admin/workers?department=${d.id}&status=PENDING`} className="ml-2 text-[#8a6d1f] hover:underline">· {d.pendingMembers} waiting</Link>
                  )}
                </p>
                <p className="text-ink/45">{d.hods.length ? `HOD: ${d.hods.join(', ')}` : 'No head of department yet'}</p>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="btn-outline px-3 py-2 text-xs" onClick={() => setEditing(d)}><Pencil size={13} /> Edit</button>
                {d.active
                  ? <button className="btn-outline px-3 py-2 text-xs" onClick={() => setActive(d, false)}><Archive size={13} /> Archive</button>
                  : <button className="btn-outline px-3 py-2 text-xs" onClick={() => setActive(d, true)}><RotateCcw size={13} /> Restore</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {archivedCount > 0 && (
        <button className="btn-ghost mt-5" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived departments' : `Show ${archivedCount} archived`}
        </button>
      )}

      {editing && <DepartmentDialog department={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
    </AppShell>
  );
}

function DepartmentDialog({ department, onClose, onSaved }) {
  const isNew = !department.id;
  const form = useForm({ name: department.name ?? '', description: department.description ?? '' });

  async function save(e) {
    e?.preventDefault();
    const body = { name: form.values.name, description: form.values.description || null };
    const res = await form.submit(() => (isNew ? api.post('/admin/departments', body) : api.patch(`/admin/departments/${department.id}`, body)));
    if (res) await onSaved();
  }

  return (
    <Modal title={isNew ? 'Add a department' : `Edit ${department.name}`} onClose={onClose} busy={form.busy}
      footer={<>
        <button className="btn-outline" onClick={onClose} disabled={form.busy}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={form.busy}>{form.busy ? <Spinner size={15} /> : 'Save'}</button>
      </>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <Alert>{form.formError}</Alert>
        <Field label="Name" error={form.errors.name}><input className="input" value={form.values.name} onChange={form.set('name')} autoFocus /></Field>
        <Field label="Description" error={form.errors.description}>
          <textarea className="input min-h-[80px]" value={form.values.description} onChange={form.set('description')} />
        </Field>
        {!isNew && <p className="text-xs font-body text-ink/45">Renaming keeps every member and their history.</p>}
      </form>
    </Modal>
  );
}
