import { useEffect, useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Empty, PageHeader, Spinner } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

/** Who changed what: approvals, suspensions, role and department changes. */
export default function Audit() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // A newer search or page replaces the one on its way, so a slow answer to
  // an old search never lands on top of the new one.
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    api.get(`/admin/audit${qs({ q: search, page, limit: 50 })}`)
      .then((res) => { if (current) setData(res); })
      .catch((err) => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [search, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <AppShell title="Audit log">
      <PageHeader title="Audit log" subtitle="Every approval, suspension and change to accounts and departments." />
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
        <input className="input pl-10" placeholder="Search by name or action" aria-label="Search the audit log"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mb-4"><Alert>{error}</Alert></div>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.entries.length === 0 ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        <ul className="card divide-y divide-purple-brand/5">
          {data.entries.map((e) => (
            <li key={e.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
              <span className="text-xs font-body text-ink/40 whitespace-nowrap sm:w-44 flex-shrink-0">{formatDateTime(e.createdAt)}</span>
              <span className="text-sm font-body text-ink/80 flex-1">{e.summary}</span>
              <span className="text-xs font-body text-ink/45 whitespace-nowrap">{e.actorName}</span>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-5 text-sm font-body text-ink/55">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button className="btn-outline px-3 py-2" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
            <button className="btn-outline px-3 py-2" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
