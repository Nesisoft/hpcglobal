import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { Alert, Empty, PageHeader, Spinner } from '../components/ui';
import { NoticeCard } from '../components/notices';
import { api } from '../lib/api';
import { setUnread } from '../lib/notices';

/** The notices meant for this worker. Opening the page counts as reading them. */
export default function Notices() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await api.get('/notices');
        if (!live) return;
        setData(res);   // "New" stays on what was new when the page opened
        const unread = res.notices.filter((n) => !n.read).map((n) => n.id);
        if (unread.length) {
          const marked = await api.post('/notices/read', { ids: unread }).catch(() => null);
          if (marked) setUnread(marked.unread);
        } else {
          setUnread(0);
        }
      } catch (err) {
        if (live) setError(err.message);
      }
    })();
    return () => { live = false; };
  }, []);

  return (
    <AppShell title="Notices">
      <PageHeader title="Notices" subtitle="From the church office and your head of department." />
      <Alert>{error}</Alert>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.notices.length === 0 ? (
        <Empty>No notices right now.</Empty>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {data.notices.map((n) => <NoticeCard key={n.id} notice={n} isNew={!n.read} />)}
        </div>
      )}
    </AppShell>
  );
}
