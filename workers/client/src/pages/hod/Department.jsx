import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, RefreshCw, Plus, Ticket } from 'lucide-react';
import AppShell from '../../components/AppShell';
import ShowQrButton from '../../components/ShowQrButton';
import { Alert, Empty, PageHeader, Spinner } from '../../components/ui';
import { PhaseChip } from '../../components/clock';
import { Register, RegisterRows, countsLine } from '../../components/register';
import { ReportView } from '../../components/report';
import { LeaveReview } from '../../components/leave';
import { TicketDesk } from '../../components/tickets';
import { NoticeCard, NoticeDialog, DeleteNoticeDialog } from '../../components/notices';
import Members from './Members';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDay, formatTimeRange, relativeDay } from '../../lib/format';

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'registers', label: 'Registers' },
  { key: 'report', label: 'Report' },
  { key: 'leave', label: 'Leave' },
  { key: 'members', label: 'Members' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'notices', label: 'Notices' },
];

// What a HOD may correct by hand: marks, never someone's own clock-in.
const markProps = {
  removeUrl: (a) => `/hod/attendance/${a.id}/remove`,
  canRemove: (a) => a.method === 'MANUAL',
};

/**
 * A head of department's tools — the reporting the old app never had: who is
 * in today, each date's register (marking in someone whose phone died), the
 * department's report, leave to approve and new members to approve.
 */
export default function Department() {
  const { worker } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'today';
  const dept = worker.department.name;
  const go = (key) => setParams(key === 'today' ? {} : { tab: key }, { replace: true });
  // A ticket started from a report row: the Tickets tab opens with it filled in.
  const [issueFor, setIssueFor] = useState(null);
  const ticketFor = (row, report) => {
    const late = row.late + row.veryLate;
    if (!row.absent && !late) return null;
    const span = `between ${formatDay(report.from, { short: true })} and ${formatDay(report.to, { short: true })}`;
    const absent = row.absent >= late;
    const times = (n) => `${n} time${n === 1 ? '' : 's'}`;
    return (
      <button className="btn-ghost px-2 py-1 text-xs text-ink/50 hover:text-purple-brand" title={`Issue ${row.worker.name} a ticket`}
        onClick={() => {
          setIssueFor({
            workerId: row.worker.id,
            type:     absent ? 'ABSENCE' : 'LATENESS',
            reason:   absent ? `Absent ${times(row.absent)} ${span}.` : `Late ${times(late)} ${span}.`,
          });
          go('tickets');
        }}>
        <Ticket size={13} /> Ticket
      </button>
    );
  };

  return (
    <AppShell title="My department">
      <PageHeader title={dept} subtitle="Who came, who didn’t, and who is excused — for your department only.">
        <span className="print:hidden"><ShowQrButton from="/department" /></span>
      </PageHeader>

      <div className="flex gap-1 mb-5 overflow-x-auto -mx-1 px-1 print:hidden" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-body whitespace-nowrap border transition-colors ${
              tab === t.key ? 'bg-purple-deep text-white border-purple-deep' : 'bg-white text-ink/60 border-purple-brand/10 hover:border-purple-brand/30'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'today' && <Today />}
      {tab === 'registers' && <Registers />}
      {tab === 'report' && <ReportView url="/hod/report" csvUrl="/hod/report.csv" printTitle={`${dept} — attendance`} rowAction={ticketFor} />}
      {tab === 'leave' && <LeaveReview base="/hod" selfId={worker.id} />}
      {tab === 'members' && <Members />}
      {tab === 'tickets' && <HodTickets selfId={worker.id} issueFor={issueFor} onIssueFor={setIssueFor} />}
      {tab === 'notices' && <HodNotices selfId={worker.id} />}
    </AppShell>
  );
}

/** Today's services, each with the department's register. */
function Today() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const load = useCallback(async () => {
    const n = ++latest.current;
    setLoading(true); setError('');
    try {
      const res = await api.get('/hod/today');
      if (n === latest.current) setData(res);
    } catch (err) {
      if (n === latest.current) setError(err.message);
    } finally {
      if (n === latest.current) setLoading(false);
    }
  }, []);
  // Fresh every minute while it's open: the view at the door on a Sunday.
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) return error ? <Alert>{error}</Alert> : <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>;
  if (!data.registers.length) return <Empty>No services today. Past dates are under Registers.</Empty>;
  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      {data.registers.map((reg) => (
        <section key={reg.session.id} className="card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-2xl text-ink font-light leading-tight">{reg.session.service.name}</h2>
                <PhaseChip phase={reg.session.phase} />
              </div>
              <p className="text-sm font-body text-ink/55">
                {formatTimeRange(reg.session.startsAt, reg.session.endsAt)}{!reg.expected && ' · optional service'}
              </p>
              <p className="text-sm font-body text-ink/75 mt-1">{countsLine(reg.counts)} of {data.members}</p>
            </div>
            <button type="button" className="btn-outline px-3 py-2 text-xs flex-shrink-0" onClick={load} disabled={loading} aria-label="Refresh">
              {loading ? <Spinner size={13} /> : <RefreshCw size={13} />} Refresh
            </button>
          </div>
          <RegisterRows data={{ ...reg, markDaysBack: data.markDaysBack }} onChanged={load} {...markProps} markUrl={`/hod/sessions/${reg.session.id}/mark`} />
        </section>
      ))}
    </div>
  );
}

/** Recent dates, each opening its register. */
function Registers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try { setData(await api.get('/hod/sessions')); } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (open) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setOpen(null); load(); }} className="btn-ghost px-0 text-sm print:hidden"><ArrowLeft size={15} /> All dates</button>
        <Register url={`/hod/sessions/${open}`} {...markProps} markUrl={`/hod/sessions/${open}/mark`} />
      </div>
    );
  }
  if (!data) return error ? <Alert>{error}</Alert> : <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>;
  if (!data.sessions.length) return <Empty>No services in the last four weeks.</Empty>;
  return (
    <div>
      <p className="text-sm font-body text-ink/55 mb-3">
        The last four weeks. Open a date to see who came — and, for the last {data.markDaysBack} days, to mark in someone whose phone let them down.
      </p>
      <ul className="card divide-y divide-purple-brand/5">
        {data.sessions.map((s) => (
          <li key={s.id}>
            <button onClick={() => setOpen(s.id)} className="w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-4 hover:bg-purple-brand/[0.03]">
              <div className="w-24 sm:w-32 flex-shrink-0 text-xs font-body font-semibold uppercase tracking-wider text-ink/45">
                {relativeDay(s.date) === formatDay(s.date) ? formatDay(s.date, { short: true }) : relativeDay(s.date)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-body font-medium truncate ${s.cancelled ? 'text-ink/40 line-through' : 'text-ink'}`}>{s.service.name}</p>
                <p className="text-xs font-body text-ink/45">
                  {s.cancelled ? 'Cancelled' : `${s.present} came`}{!s.expected && ' · optional'}
                </p>
              </div>
              <ChevronRight size={16} className="text-ink/30 flex-shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The department's tickets, with its members and recent services to issue them for. */
function HodTickets({ selfId, issueFor, onIssueFor }) {
  const [people, setPeople] = useState(null);
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    api.get('/hod/members?status=ACTIVE').then((r) => setPeople(r.members)).catch(() => setPeople([]));
    api.get('/hod/sessions').then((r) => setSessions(r.sessions.filter((s) => !s.cancelled))).catch(() => {});
  }, []);
  return <TicketDesk base="/hod" selfId={selfId} people={people} sessions={sessions} issueFor={people ? issueFor : null} onIssueFor={onIssueFor} />;
}

/** Notices to the department: post one, see who has read them, take down one's own. */
function HodNotices({ selfId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [writing, setWriting] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const load = useCallback(async () => {
    setError('');
    try { setData(await api.get('/hod/notices')); } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center gap-3 mb-4">
        <p className="text-sm font-body text-ink/55">Notices to your department. The church office’s notices for everyone show under Notices.</p>
        <button onClick={() => { setNotice(''); setWriting(true); }} className="btn-primary flex-shrink-0"><Plus size={16} /> New notice</button>
      </div>
      <div className="space-y-3 mb-4">
        <Alert>{error}</Alert>
        {notice && <Alert kind="success">{notice}</Alert>}
      </div>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.notices.length === 0 ? (
        <Empty>No notices to your department yet.</Empty>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {data.notices.map((n) => (
            <NoticeCard key={n.id} notice={n} manage members={data.members} onDelete={n.authorId === selfId ? setDeleting : undefined} />
          ))}
        </div>
      )}
      {writing && (
        <NoticeDialog url="/hod/notices" onClose={() => setWriting(false)}
          onDone={async () => { setWriting(false); setNotice('Posted to your department.'); await load(); }} />
      )}
      {deleting && (
        <DeleteNoticeDialog notice={deleting} url={`/hod/notices/${deleting.id}`} onClose={() => setDeleting(null)}
          onDone={async () => { setDeleting(null); setNotice('Notice taken down.'); await load(); }} />
      )}
    </div>
  );
}
