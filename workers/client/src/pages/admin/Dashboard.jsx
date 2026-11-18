import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus, CalendarOff, Percent, ChevronRight } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Empty, PageHeader, Spinner, StatCard } from '../../components/ui';
import { PhaseChip } from '../../components/clock';
import { countsLine } from '../../components/register';
import { RateCell, WeeklyTrend } from '../../components/report';
import { api } from '../../lib/api';
import { formatMonth, formatTimeRange } from '../../lib/format';

/** Today at a glance, what is waiting, and how this month is going. */
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setData(await api.get('/admin/dashboard')); } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <AppShell title="Dashboard">
      <PageHeader title="Dashboard" subtitle={data ? `${formatMonth(data.month.from.slice(0, 7))} so far` : 'Today and this month'} />
      <Alert>{error}</Alert>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon={Percent} label="Attendance this month" value={data.month.totals.rate == null ? '—' : `${Math.round(data.month.totals.rate)}%`} color="purple" />
            <StatCard icon={Users} label="Active workers" value={data.workers} color="green" />
            <Link to="/admin/workers?status=PENDING" className="block hover:shadow-md rounded-xl transition-shadow">
              <StatCard icon={UserPlus} label="Sign-ups waiting" value={data.waiting.approvals} color={data.waiting.approvals ? 'gold' : 'purple'} />
            </Link>
            <Link to="/admin/leave" className="block hover:shadow-md rounded-xl transition-shadow">
              <StatCard icon={CalendarOff} label="Leave waiting" value={data.waiting.leave} color={data.waiting.leave ? 'gold' : 'purple'} />
            </Link>
          </div>

          <section>
            <h2 className="section-label mb-2">Today</h2>
            {data.today.length === 0 ? <Empty>No services today.</Empty> : (
              <ul className="card divide-y divide-purple-brand/5">
                {data.today.map((t) => (
                  <li key={t.session.id}>
                    <Link to={`/admin/register/${t.session.id}`} className="px-4 sm:px-5 py-3.5 flex items-center gap-4 hover:bg-purple-brand/[0.03]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-body font-medium text-ink">{t.session.service.name}</p>
                          <PhaseChip phase={t.session.phase} />
                        </div>
                        <p className="text-xs font-body text-ink/50 mt-0.5">
                          {formatTimeRange(t.session.startsAt, t.session.endsAt)} · {countsLine(t.counts)}{t.late ? ` · ${t.late} late` : ''}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-ink/30 flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <WeeklyTrend weeks={data.month.weeks} />

          {data.departments.length > 0 && (
            <section className="card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-label">Departments this month</h2>
                <Link to="/admin/reports" className="text-sm font-body text-purple-brand hover:underline">Full report</Link>
              </div>
              <ul className="space-y-2">
                {[...data.departments].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)).map((d) => (
                  <li key={d.id} className="flex items-center gap-3">
                    <span className="flex-1 min-w-0 truncate text-sm font-body text-ink">{d.name}</span>
                    <span className="text-xs font-body text-ink/45 whitespace-nowrap">{d.attended} of {d.expected - d.excused}</span>
                    <RateCell rate={d.rate} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
