import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarCheck, CircleCheck, Timer, Clock, TriangleAlert, RotateCcw } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Alert, Empty, PageHeader, Spinner, StatCard } from '../components/ui';
import { AttendanceBadge, MethodTag } from '../components/clock';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { accraParts, accraToday, addMonths, formatDay, formatDuration, formatMonth, formatTime } from '../lib/format';

/** "12.5 h" — short enough for a stat card on a phone. */
const hours = (minutes) => {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} h`;
};

/** A worker's own attendance, a month at a time. */
export default function History() {
  const { worker } = useAuth();
  const thisMonth = accraToday().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // From the month they joined (nothing can come before it) to this one.
  const months = useMemo(() => {
    const joined = worker.createdAt ? accraParts(worker.createdAt).date.slice(0, 7) : thisMonth;
    const list = [];
    for (let m = thisMonth; list.length < 36; m = addMonths(m, -1)) {
      list.push(m);
      if (m <= joined) break;
    }
    return list;
  }, [worker.createdAt, thisMonth]);
  const index = months.indexOf(month);

  // Flicking through months quickly: only the month on screen gets its answer.
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    api.get(`/clock/history${qs({ month })}`)
      .then((res) => { if (current) setData(res); })
      .catch((err) => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [month, attempt]);

  const s = data?.summary;
  // "Late" here is everyone not on time, late or very late alike.
  const late = s ? Math.max(0, (s.attended ?? 0) - (s.onTime ?? 0)) : null;

  return (
    <AppShell title="My attendance">
      <PageHeader title="My attendance" subtitle="Every service you’ve clocked in to." />

      <div className="flex items-center gap-2 mb-5">
        <button type="button" className="btn-outline px-3 py-2.5" aria-label="Previous month"
          disabled={index === -1 || index >= months.length - 1} onClick={() => setMonth(months[index + 1])}>
          <ChevronLeft size={16} />
        </button>
        <select className="input flex-1 sm:flex-none sm:w-56" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{m === thisMonth ? `This month (${formatMonth(m)})` : formatMonth(m)}</option>)}
        </select>
        <button type="button" className="btn-outline px-3 py-2.5" aria-label="Next month"
          disabled={index <= 0} onClick={() => setMonth(months[index - 1])}>
          <ChevronRight size={16} />
        </button>
      </div>

      {error && (
        <div className="mb-4 space-y-3">
          <Alert>{error}</Alert>
          <button type="button" className="btn-outline px-4 py-2.5" onClick={() => setAttempt((n) => n + 1)}><RotateCcw size={15} /> Try again</button>
        </div>
      )}

      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatCard icon={CalendarCheck} label="Attended" value={s?.attended ?? 0} color="purple" />
            <StatCard icon={CircleCheck} label="On time" value={s?.onTime ?? 0} color="green" />
            <StatCard icon={Timer} label="Late" value={late ?? 0} color="gold" />
            <StatCard icon={Clock} label="Time present" value={hours(s?.minutes ?? 0)} color="purple" />
          </div>

          {data.records.length === 0 ? (
            <Empty>
              {month === thisMonth
                ? 'Nothing yet this month. Clock in at your next service and it shows here.'
                : `No attendance recorded in ${formatMonth(month)}.`}
            </Empty>
          ) : (
            <ul className="card divide-y divide-purple-brand/5">
              {data.records.map((r) => <Record key={r.id} record={r} />)}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}

function Record({ record: r }) {
  const notes = [];
  if (r.autoClockedOut) notes.push('Didn’t clock out');
  else if (r.leftEarlyMinutes > 0) notes.push(`Left ${formatDuration(r.leftEarlyMinutes)} early`);
  if (r.short) notes.push('Short attendance');

  return (
    <li className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5">
      <div className="sm:w-28 flex-shrink-0 text-xs font-body font-semibold uppercase tracking-wider text-ink/45">
        {formatDay(r.session?.date, { short: true })}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-body font-semibold text-ink truncate">{r.session?.service?.name ?? 'Service'}</p>
        <p className="text-sm font-body text-ink/60">
          In {formatTime(r.clockInAt)}
          {r.clockOutAt && !r.autoClockedOut && <> · Out {formatTime(r.clockOutAt)}</>}
          {r.minutesPresent !== null && r.minutesPresent !== undefined && !r.autoClockedOut && (
            <span className="text-ink/45"> · {formatDuration(r.minutesPresent)}</span>
          )}
          {!r.clockOutAt && !r.autoClockedOut && r.method !== 'MANUAL' && <span className="text-ink/45"> · still clocked in</span>}
          {r.method === 'MANUAL' && r.markedByName && <span className="text-ink/45"> · marked present by {r.markedByName}</span>}
        </p>
        {notes.length > 0 && (
          <p className="text-xs font-body text-[#8a6d1f] mt-0.5 flex items-center gap-1.5">
            <TriangleAlert size={12} aria-hidden="true" /> {notes.join(' · ')}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <AttendanceBadge attendance={r} />
        <MethodTag method={r.method} />
      </div>
    </li>
  );
}
