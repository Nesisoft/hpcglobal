import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Printer, Percent, UserCheck, UserX, CalendarOff, Clock } from 'lucide-react';
import { Alert, Empty, Spinner, StatCard } from './ui';
import { api, download, qs } from '../lib/api';
import { accraToday, addDays, addMonths, formatDay } from '../lib/format';

// ─── The period ───────────────────────────────────────────────────────────────

function presets(today = accraToday()) {
  const month = today.slice(0, 7);
  const lastMonthEnd = addDays(`${month}-01`, -1);
  return [
    { key: 'month', label: 'This month', from: `${month}-01`, to: today },
    { key: 'last', label: 'Last month', from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd },
    { key: 'quarter', label: 'Last 3 months', from: `${addMonths(month, -2)}-01`, to: today },
    { key: 'year', label: 'This year', from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

export function PeriodPicker({ period, onChange }) {
  const options = presets();
  const active = options.find((p) => p.from === period.from && p.to === period.to)?.key ?? 'custom';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((p) => (
        <button key={p.key} onClick={() => onChange({ from: p.from, to: p.to })}
          className={`px-3.5 py-1.5 rounded-full text-sm font-body whitespace-nowrap border transition-colors ${
            active === p.key ? 'bg-purple-deep text-white border-purple-deep' : 'bg-white text-ink/60 border-purple-brand/10 hover:border-purple-brand/30'}`}>
          {p.label}
        </button>
      ))}
      <span className="flex items-center gap-1.5 text-sm font-body text-ink/50">
        <input type="date" aria-label="From" className="input py-1.5 px-2 w-[9.5rem]" value={period.from} max={period.to}
          onChange={(e) => e.target.value && onChange({ ...period, from: e.target.value })} />
        to
        <input type="date" aria-label="To" className="input py-1.5 px-2 w-[9.5rem]" value={period.to} min={period.from}
          onChange={(e) => e.target.value && onChange({ ...period, to: e.target.value })} />
      </span>
    </div>
  );
}

export const thisMonth = () => { const p = presets()[0]; return { from: p.from, to: p.to }; };

// ─── Pieces ───────────────────────────────────────────────────────────────────

const pct = (v) => (v == null ? '—' : `${Math.round(v)}%`);
const rateTone = (v) => (v == null ? 'text-ink/40' : v >= 80 ? 'text-green-700' : v >= 50 ? 'text-[#8a6d1f]' : 'text-red-600');

/** A rate as a number and a short bar. */
export function RateCell({ rate }) {
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="hidden sm:block w-16 h-1.5 rounded-full bg-purple-brand/8 overflow-hidden print:hidden" aria-hidden="true">
        <div className="h-full bg-purple-brand" style={{ width: `${Math.max(0, Math.min(100, rate ?? 0))}%` }} />
      </div>
      <span className={`font-body font-semibold tabular-nums w-11 text-right ${rateTone(rate)}`}>{pct(rate)}</span>
    </div>
  );
}

/** Attendance week by week: one bar per week, its height the rate. */
export function WeeklyTrend({ weeks }) {
  if (!weeks?.length) return null;
  return (
    <section className="card p-4 sm:p-5 break-inside-avoid">
      <h2 className="section-label mb-1">Week by week</h2>
      <p className="text-xs font-body text-ink/45 mb-4">Attendance each week, from its Monday. Leave isn’t counted against anyone.</p>
      <div className="flex items-end gap-1.5 sm:gap-2 h-40 overflow-x-auto pb-1" role="list" aria-label="Attendance by week">
        {weeks.map((w) => (
          <div key={w.week} role="listitem" className="flex-1 min-w-[2.25rem] max-w-[4.5rem] h-full flex flex-col items-center justify-end gap-1"
            aria-label={`Week of ${formatDay(w.week, { short: true })}: ${pct(w.rate)}, ${w.attended} of ${w.expected - w.excused}`}>
            <span className={`text-[11px] font-body font-semibold tabular-nums ${rateTone(w.rate)}`}>{pct(w.rate)}</span>
            <div className="w-full rounded-t bg-purple-brand/80 print:bg-purple-brand" style={{ height: `${Math.max(2, w.rate ?? 0) * 0.85}%` }}
              title={`${w.attended} of ${w.expected - w.excused} expected`} />
            <span className="text-[10px] font-body text-ink/45 whitespace-nowrap">{formatDay(w.week, { short: true }).replace(/^\w+\s/, '')}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Totals({ totals }) {
  const due = totals.expected - totals.excused;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
      <StatCard icon={Percent} label="Attendance" value={pct(totals.rate)} color="purple" />
      <StatCard icon={UserCheck} label={`Attended of ${due}`} value={totals.attended} color="green" />
      <StatCard icon={Clock} label="Late" value={totals.late + totals.veryLate} color="gold" />
      <StatCard icon={CalendarOff} label="On leave" value={totals.excused} color="purple" />
      <StatCard icon={UserX} label="Absent" value={totals.absent} color="red" />
    </div>
  );
}

function WorkerTable({ rows, showDepartment, rowAction, report }) {
  if (!rows.length) return <Empty>Nobody to report on.</Empty>;
  const th = 'px-3 py-2.5 text-[11px] font-body font-semibold uppercase tracking-wider text-ink/45 text-right whitespace-nowrap';
  const td = 'px-3 py-2.5 text-sm font-body text-ink/75 text-right tabular-nums';
  return (
    <section className="card overflow-x-auto">
      <table className="w-full min-w-[40rem]">
        <thead className="border-b border-purple-brand/10">
          <tr>
            <th className={`${th} text-left sticky left-0 bg-white`}>Name</th>
            <th className={th} title="Services they were expected at">Expected</th>
            <th className={th}>Came</th>
            <th className={th}>Late</th>
            <th className={th}>On leave</th>
            <th className={th}>Absent</th>
            <th className={th} title="Left more than the allowed minutes before the end">Left early</th>
            <th className={th} title="Clocked in but never clocked out">No clock-out</th>
            <th className={th}>Rate</th>
            {rowAction && <th className="print:hidden"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-purple-brand/5">
          {rows.map((r) => (
            <tr key={r.worker.id} className="break-inside-avoid">
              <td className="px-3 py-2.5 text-sm font-body text-left sticky left-0 bg-white max-w-[9rem] sm:max-w-none">
                <span className="font-medium text-ink">{r.worker.name}</span>
                {r.worker.isHod && <span className="ml-1.5 text-[10px] text-gold font-semibold uppercase tracking-wider">HOD</span>}
                {showDepartment && <span className="block text-xs text-ink/45">{r.worker.department?.name ?? 'No department'}</span>}
              </td>
              <td className={td}>{r.expected}</td>
              <td className={td}>{r.attended}</td>
              <td className={td}>{r.late + r.veryLate || ''}</td>
              <td className={td}>{r.excused || ''}</td>
              <td className={`${td} ${r.absent ? 'text-red-600 font-medium' : ''}`}>{r.absent || ''}</td>
              <td className={td}>{r.leftEarly || ''}</td>
              <td className={td}>{r.noClockOut || ''}</td>
              <td className="px-3 py-2.5"><RateCell rate={r.rate} /></td>
              {rowAction && <td className="px-2 py-2.5 text-right print:hidden">{rowAction(r, report)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** A small table of rolled-up rows (by department, by service). */
export function RollupTable({ title, rows, nameLabel, extraColumn }) {
  if (!rows?.length) return null;
  const th = 'px-3 py-2.5 text-[11px] font-body font-semibold uppercase tracking-wider text-ink/45 text-right whitespace-nowrap';
  const td = 'px-3 py-2.5 text-sm font-body text-ink/75 text-right tabular-nums';
  return (
    <section className="card overflow-x-auto break-inside-avoid">
      <h2 className="section-label px-4 pt-4">{title}</h2>
      <table className="w-full min-w-[32rem]">
        <thead className="border-b border-purple-brand/10">
          <tr>
            <th className={`${th} text-left`}>{nameLabel}</th>
            {extraColumn && <th className={th}>{extraColumn.label}</th>}
            <th className={th}>Expected</th>
            <th className={th}>Came</th>
            <th className={th}>On leave</th>
            <th className={th}>Absent</th>
            <th className={th}>Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-purple-brand/5">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2.5 text-sm font-body font-medium text-ink text-left">{r.name}</td>
              {extraColumn && <td className={td}>{extraColumn.value(r)}</td>}
              <td className={td}>{r.expected}</td>
              <td className={td}>{r.attended}</td>
              <td className={td}>{r.excused || ''}</td>
              <td className={td}>{r.absent || ''}</td>
              <td className="px-3 py-2.5"><RateCell rate={r.rate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── The report ───────────────────────────────────────────────────────────────

/**
 * A report for a period: totals, the weekly trend, a row per worker, and —
 * through `extra` — whatever else the page adds. `url` and `csvUrl` are the
 * API's; `filters` are added to both.
 */
export function ReportView({ url, csvUrl, csvViews, filters = {}, printTitle, showDepartment = false, extra, rowAction }) {
  const [period, setPeriod] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  const query = qs({ ...period, ...filters });
  const latest = useRef(0);
  const load = useCallback(async () => {
    const n = ++latest.current;
    setError('');
    try {
      const res = await api.get(`${url}${query}`);
      if (n === latest.current) setData(res);
    } catch (err) {
      if (n === latest.current) setError(err.message);
    }
  }, [url, query]);
  useEffect(() => { setData(null); load(); }, [load]);

  async function getCsv(view) {
    setDownloading(view || 'csv'); setError('');
    try {
      await download(`${csvUrl}${qs({ ...period, ...filters, view })}`, 'attendance.csv');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading('');
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden">
        <PeriodPicker period={period} onChange={setPeriod} />
        <div className="flex gap-2 flex-wrap">
          {(csvViews ?? [{ view: '', label: 'CSV' }]).map((v) => (
            <button key={v.view || 'csv'} onClick={() => getCsv(v.view)} disabled={!data || Boolean(downloading)} className="btn-outline px-3.5 py-2 text-sm">
              {downloading === (v.view || 'csv') ? <Spinner size={14} /> : <Download size={14} />} {v.label}
            </button>
          ))}
          <button onClick={() => window.print()} disabled={!data} className="btn-outline px-3.5 py-2 text-sm">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="font-display text-3xl text-ink">{printTitle}</h1>
        {data && <p className="font-body text-sm text-ink/60">{formatDay(data.from, { year: true })} to {formatDay(data.to, { year: true })}</p>}
      </div>

      <Alert>{error}</Alert>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : (
        <>
          <p className="text-sm font-body text-ink/55 print:hidden">
            {data.sessions === 0
              ? 'No services that count towards attendance were held in this period.'
              : `${data.sessions} service${data.sessions === 1 ? '' : 's'} that count, ${formatDay(data.from, { short: true })} to ${formatDay(data.to, { short: true })}. Lowest attendance first.`}
          </p>
          <Totals totals={data.totals} />
          <WeeklyTrend weeks={data.weeks} />
          {extra?.(data)}
          <WorkerTable rows={data.rows} showDepartment={showDepartment} rowAction={rowAction} report={data} />
        </>
      )}
    </div>
  );
}
