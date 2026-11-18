import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Empty, PageHeader, Spinner } from '../../components/ui';
import { NoticeCard, NoticeDialog, DeleteNoticeDialog } from '../../components/notices';
import { api } from '../../lib/api';

/** Every notice — showing, scheduled and expired — and how many have read each. */
export default function AdminNotices() {
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);   // {} for a new one
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try { setData(await api.get('/admin/notices')); } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => {
    load();
    api.get('/admin/departments').then((r) => setDepartments(r.departments)).catch(() => setDepartments([]));
  }, [load]);

  return (
    <AppShell title="Notices">
      <PageHeader title="Notices" subtitle="To everyone, one department, or the heads of department. Heads of department can also post to their own.">
        <button onClick={() => { setNotice(''); setEditing({}); }} className="btn-primary" disabled={!departments}><Plus size={16} /> New notice</button>
      </PageHeader>
      <div className="space-y-3 mb-4">
        <Alert>{error}</Alert>
        {notice && <Alert kind="success">{notice}</Alert>}
      </div>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.notices.length === 0 ? (
        <Empty>No notices yet.</Empty>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {data.notices.map((n) => (
            <NoticeCard key={n.id} notice={n} manage onEdit={(x) => { setNotice(''); setEditing(x); }} onDelete={setDeleting} />
          ))}
        </div>
      )}
      {editing && (
        <NoticeDialog
          notice={editing.id ? editing : null}
          url={editing.id ? `/admin/notices/${editing.id}` : '/admin/notices'}
          method={editing.id ? 'patch' : 'post'}
          departments={departments ?? []}
          onClose={() => setEditing(null)}
          onDone={async () => { setNotice(editing.id ? 'Notice saved.' : 'Notice posted.'); setEditing(null); await load(); }}
        />
      )}
      {deleting && (
        <DeleteNoticeDialog notice={deleting} url={`/admin/notices/${deleting.id}`} onClose={() => setDeleting(null)}
          onDone={async () => { setDeleting(null); setNotice('Notice taken down.'); await load(); }} />
      )}
    </AppShell>
  );
}
