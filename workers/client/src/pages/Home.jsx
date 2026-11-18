import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, MapPin, LogIn, LogOut, UserCheck, UserCog, ChevronRight, CalendarDays, History as HistoryIcon,
  CircleCheck, TriangleAlert, RotateCcw, QrCode, MapPinOff, Keyboard, Lock, CalendarOff, LayoutDashboard,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import { Alert, Modal, Spinner } from '../components/ui';
import { AttendanceBadge, CodeDialog, MethodTag, PhaseChip, QrHint, phaseAt, useNow } from '../components/clock';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getPosition, LocationError, locationProblem } from '../lib/geo';
import {
  accraParts, formatDay, formatDuration, formatTime, formatTimeRange, formatWait, greeting, relativeDay,
} from '../lib/format';

/**
 * Home: the service on now, and one big button.
 *
 * Laid out like the old app's home screen, which workers already knew — the
 * clock, a large round Clock in / Clock out button, where the service is, and
 * a strip of clock-in, clock-out and time spent — in the website's colours,
 * and putting right what it left unsaid: on time or late shown at once, time
 * spent counting while you're in, why the button can't be pressed yet, how
 * far away you are when the phone says you're not at church, and a warning
 * before a too-short clock-out rather than a note after it.
 */
export default function Home() {
  const { worker, isHod, isAdmin } = useAuth();
  const [waiting, setWaiting] = useState({ department: null, all: null, leave: null });
  const [typingCode, setTypingCode] = useState(false);
  const [offset, setOffset] = useState(0);   // server time − phone time, from /clock/today

  // People waiting for this person to approve them.
  useEffect(() => {
    if (isHod) api.get('/hod/members?status=PENDING').then((r) => setWaiting((w) => ({ ...w, department: r.counts.PENDING }))).catch(() => {});
    if (isHod) api.get('/hod/leave?status=PENDING').then((r) => setWaiting((w) => ({ ...w, leave: r.waiting }))).catch(() => {});
    if (isAdmin) api.get('/admin/workers?status=PENDING&limit=1').then((r) => setWaiting((w) => ({ ...w, all: r.counts.PENDING }))).catch(() => {});
  }, [isHod, isAdmin]);

  return (
    <AppShell title="Home">
      <Welcome firstName={worker.firstName} offset={offset}
        detail={worker.department ? `${isHod ? 'Head of ' : ''}${worker.department.name}` : 'HPC Global'} />

      <Today onTypeCode={() => setTypingCode(true)} onOffset={setOffset} />

      <section className="grid sm:grid-cols-2 gap-4">
        <ActionCard to="/history" icon={HistoryIcon} title="My attendance" text="Every service you’ve clocked in to, month by month" />
        <ActionCard to="/leave" icon={CalendarOff} title="My leave" text="Ask to be excused when you’re ill, travelling or away" />
        {isHod && (
          <ActionCard
            to={waiting.department ? '/department?tab=members' : waiting.leave ? '/department?tab=leave' : '/department'}
            icon={UserCheck}
            title={worker.department.name}
            text={[
              waiting.department && `${waiting.department} sign-up${waiting.department === 1 ? '' : 's'} to approve`,
              waiting.leave && `${waiting.leave} leave request${waiting.leave === 1 ? '' : 's'} to review`,
            ].filter(Boolean).join(' · ') || 'Who came today, registers and your department’s report'}
            highlight={Boolean(waiting.department || waiting.leave)} />
        )}
        {isAdmin && (
          <ActionCard to="/admin" icon={LayoutDashboard} title="Dashboard" text="Today across the church, and this month’s attendance" />
        )}
        {isAdmin && (
          <ActionCard to="/admin/workers?status=PENDING" icon={UserCog}
            title="Workers"
            text={waiting.all ? `${waiting.all} sign-ups waiting across all departments` : 'Approve sign-ups and manage accounts'}
            highlight={Boolean(waiting.all)} />
        )}
        {isAdmin && (
          <ActionCard to="/admin/sessions" icon={CalendarDays} title="Sessions" text="Show the QR code and see who’s in" />
        )}
      </section>

      {typingCode && <CodeDialog onClose={() => setTypingCode(false)} />}
    </AppShell>
  );
}

/** The greeting, with the time and date as the server keeps them — the clock the button goes by. */
function Welcome({ firstName, detail, offset }) {
  const now = useNow(1000) + offset;
  const parts = accraParts(now);
  return (
    <section className="rounded-2xl bg-purple-deep text-white px-6 py-6 sm:px-8 mb-6 relative overflow-hidden"
      style={{ backgroundImage: 'radial-gradient(circle at 85% 20%, rgba(90,45,175,0.55), transparent 55%), radial-gradient(circle at 10% 100%, rgba(201,168,76,0.14), transparent 45%)' }}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="section-label">{greeting(new Date(now))}</p>
          <h1 className="font-display text-3xl sm:text-4xl font-light mt-1 truncate">{firstName}</h1>
          <p className="text-white/55 font-body text-sm mt-0.5 truncate">{detail}</p>
        </div>
        <div className="text-right flex-shrink-0" aria-label={`The time is ${formatTime(now)}`}>
          <p className="font-display text-4xl sm:text-5xl font-light leading-none tabular-nums">{formatTime(now)}</p>
          <p className="text-white/55 font-body text-xs mt-1.5">{formatDay(parts.date, { short: true })}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * Today's services. The one that matters now — open for clock-in or still
 * clocked into, else the next one today, else the last — gets the big
 * button; any others sit below as a list, and tapping one brings it up. Kept
 * fresh after every clock-in or out, whenever the app comes back to the
 * front, and every couple of minutes, because the server closes services and
 * clocks out the forgetful as it answers.
 */
function Today({ onTypeCode, onOffset }) {
  const [data, setData] = useState(null);       // { sessions, next, rules, offset }
  const [error, setError] = useState('');
  const [acting, setActing] = useState(null);   // { id, stage: 'locating' | 'sending', action }
  const [outcomes, setOutcomes] = useState({}); // session id → what the last try said
  const [confirmOut, setConfirmOut] = useState(null);
  const [chosen, setChosen] = useState(null);   // a session id the worker tapped

  // Only the latest request's answer is shown: a refresh on focus that
  // overtakes the one after a clock-in must not put the older picture back.
  const requests = useRef(0);
  const lastLoad = useRef(0);
  const load = useCallback(async () => {
    const n = ++requests.current;
    lastLoad.current = Date.now();
    const sentAt = Date.now();
    try {
      const res = await api.get('/clock/today');
      if (n !== requests.current) return;
      // The phone's own clock may be minutes out; the server's is the one
      // that decides, so the clock and every countdown here run on the
      // server's time, read from the middle of the round trip.
      const offset = Date.parse(res.serverTime) - (sentAt + Date.now()) / 2;
      const off = Number.isFinite(offset) ? offset : 0;
      setData({ sessions: res.sessions ?? [], next: res.next ?? null, rules: res.rules ?? null, offset: off });
      onOffset(off);
      setError('');
    } catch (err) {
      if (n === requests.current) setError(err.message);
    }
  }, [onOffset]);

  useEffect(() => {
    load();
    // Focus and visibility often fire together; one request is enough.
    const again = () => { if (Date.now() - lastLoad.current > 3000) load(); };
    const onVisible = () => { if (document.visibilityState === 'visible') again(); };
    window.addEventListener('focus', again);
    window.addEventListener('online', again);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 120000);
    return () => {
      window.removeEventListener('focus', again);
      window.removeEventListener('online', again);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [load]);

  const tick = useNow(10000);
  const now = tick + (data?.offset ?? 0);

  const setOutcome = (id, outcome) => setOutcomes((o) => ({ ...o, [id]: outcome }));

  // One clock-in or out at a time, even from a quick double tap that lands
  // before the button has had a chance to show it's busy.
  const busy = useRef(false);

  async function clock(session, action) {
    if (busy.current) return;
    setOutcome(session.id, null);
    // Without a connection there is no point waiting for a GPS fix first.
    if (navigator.onLine === false) {
      setOutcome(session.id, { kind: 'refused', message: 'You’re offline. Clocking in and out needs a connection — try again once you’re back online.' });
      return;
    }
    busy.current = true;
    setActing({ id: session.id, stage: 'locating', action });
    let position;
    try {
      position = await getPosition();
    } catch (err) {
      setOutcome(session.id, { kind: 'location', problem: err instanceof LocationError ? err.kind : 'UNAVAILABLE' });
      busy.current = false;
      setActing(null);
      return;
    }
    setActing({ id: session.id, stage: 'sending', action });
    try {
      const res = await api.post(`/clock/${action}`, { sessionId: session.id, ...position });
      setOutcome(session.id, { kind: 'success', message: res.message });
    } catch (err) {
      setOutcome(session.id, {
        kind: 'refused', message: err.message, code: err.code, field: err.field, status: err.status,
        distanceM: err.body?.distanceM, accuracy: position.accuracy,
      });
    } finally {
      busy.current = false;
      setActing(null);
      load();
    }
  }

  // Clocking out while the service is still on is recorded as leaving early,
  // and too soon after clocking in it doesn't count as a full attendance —
  // so say so before, not after (the old app only told them afterwards).
  function askOut(session) {
    const a = session.attendance;
    const minutesIn = a ? Math.floor((now - Date.parse(a.clockInAt)) / 60000) : 0;
    const short = data?.rules ? minutesIn < data.rules.minValidMinutes : false;
    const early = now < Date.parse(session.endsAt);
    if (early || short) setConfirmOut({ session, minutesIn, short, early });
    else clock(session, 'out');
  }

  const today = accraParts(now).date;
  const sessions = data?.sessions ?? [];
  const focus = sessions.find((s) => s.id === chosen) ?? pickFocus(sessions, now);
  const others = sessions.filter((s) => s.id !== focus?.id);

  return (
    <section className="mb-6" aria-labelledby="today-heading">
      <h2 id="today-heading" className="sr-only">Today’s services</h2>

      {!data ? (
        error ? (
          <div className="card p-6 text-center space-y-3">
            <p className="text-sm font-body text-ink/65">We couldn’t load today’s services. {error}</p>
            <button type="button" className="btn-outline px-4 py-2.5" onClick={load}><RotateCcw size={15} /> Try again</button>
          </div>
        ) : (
          <div className="card p-6 flex items-center justify-center gap-3 text-purple-brand" role="status">
            <Spinner size={20} /> <span className="text-sm font-body text-ink/55">Getting today’s services…</span>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-center justify-between gap-3 text-sm font-body text-ink/55 bg-white border border-purple-brand/10 rounded-lg px-4 py-2.5" role="status">
              <span>Couldn’t refresh just now — this may be out of date.</span>
              <button type="button" onClick={load} className="text-purple-brand font-medium whitespace-nowrap hover:underline">Try again</button>
            </div>
          )}

          {focus && (
            <FocusCard session={focus} now={now} acting={acting} outcome={outcomes[focus.id]}
              onClockIn={() => clock(focus, 'in')} onClockOut={() => askOut(focus)} onTypeCode={onTypeCode} />
          )}

          {others.length > 0 && (
            <div>
              <p className="label mb-2">{focus ? 'Also today' : 'Today'}</p>
              <ul className="card divide-y divide-purple-brand/5">
                {others.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setChosen(s.id)}
                      className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#F9F8FC] focus:outline-none focus-visible:bg-[#F9F8FC]">
                      <div className="flex-1 min-w-0">
                        <p className="font-body font-semibold text-ink text-sm truncate">{s.service.name}</p>
                        <p className="text-xs font-body text-ink/50">{formatTimeRange(s.startsAt, s.endsAt)}</p>
                      </div>
                      {s.attendance ? <AttendanceBadge attendance={s.attendance} /> : <PhaseChip phase={phaseAt(s, now)} />}
                      <ChevronRight size={16} className="text-ink/25 flex-shrink-0" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.next && <NextCard session={data.next} today={today} hadToday={sessions.length > 0} />}

          {!sessions.length && !data.next && (
            <div className="card p-6 flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-gold/10 ring-1 ring-gold/20 flex items-center justify-center flex-shrink-0">
                <Clock size={20} className="text-gold" />
              </div>
              <p className="text-ink/60 font-body text-sm pt-1">
                No services are on the calendar yet. Once the church office adds them, this is where you clock in and out.
              </p>
            </div>
          )}
        </div>
      )}

      {confirmOut && (
        <Modal title="Clock out now?" onClose={() => setConfirmOut(null)}
          footer={<>
            <button type="button" className="btn-outline" onClick={() => setConfirmOut(null)}>Not yet</button>
            <button type="button" className="btn-purple"
              onClick={() => { const { session } = confirmOut; setConfirmOut(null); clock(session, 'out'); }}>
              <LogOut size={15} /> Clock out
            </button>
          </>}>
          <div className="space-y-3 text-sm font-body text-ink/70">
            {confirmOut.short && (
              <p className="flex items-start gap-2 text-[#8a6d1f]">
                <TriangleAlert size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  You’ve been here {formatDuration(confirmOut.minutesIn)}. Under {formatDuration(data.rules.minValidMinutes)} counts
                  as a short attendance, not a full one.
                </span>
              </p>
            )}
            {confirmOut.early && (
              <p>{confirmOut.session.service.name} runs until {formatTime(confirmOut.session.endsAt)}. If you clock out now, it’s recorded that you left early.</p>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}

/** The session the big button is for: one to clock into or out of now, else the next today, else the last. */
function pickFocus(sessions, now) {
  const actionable = sessions.find((s) => {
    const a = s.attendance;
    const phase = phaseAt(s, now);
    if (!a) return phase === 'open' || phase === 'running';
    return !a.clockOutAt && !a.autoClockedOut && now < Date.parse(s.window.clockOutUntil);
  });
  return actionable
    ?? sessions.find((s) => phaseAt(s, now) === 'upcoming')
    ?? sessions[sessions.length - 1]
    ?? null;
}

/** The service on now: where and when, the big button, and the strip of in, out and time spent. */
function FocusCard({ session, now, acting, outcome, onClockIn, onClockOut, onTypeCode }) {
  const a = session.attendance;
  const phase = phaseAt(session, now);
  const canIn = !a && (phase === 'open' || phase === 'running');
  // Closed for them after the clock-out time (autoClockedOut) counts as out,
  // though no clock-out time was recorded.
  const out = Boolean(a && (a.clockOutAt || a.autoClockedOut));
  const canOut = Boolean(a && !out && now < Date.parse(session.window.clockOutUntil));
  const mine = acting?.id === session.id;
  const gps = session.service.hasLocation;
  const minutesIn = a && !out ? Math.max(0, Math.floor((now - Date.parse(a.clockInAt)) / 60000)) : null;

  return (
    <article className="card p-5 sm:p-6" aria-labelledby={`focus-${session.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`focus-${session.id}`} className="font-display text-2xl text-ink leading-tight">{session.service.name}</h3>
          <p className="text-sm font-body text-ink/55 mt-1 inline-flex items-center gap-1.5">
            <Clock size={13} aria-hidden="true" />{formatTimeRange(session.startsAt, session.endsAt)}
          </p>
        </div>
        <PhaseChip phase={phase} />
      </div>
      {session.note && <p className="text-sm font-body text-ink/60 italic mt-2">“{session.note}”</p>}

      <div className="flex flex-col items-center py-6">
        <BigButton {...{ phase, a, out, canIn, canOut, gps, mine, acting, now, session, minutesIn, onClockIn, onClockOut, onTypeCode }} />
        {a && (
          <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
            <AttendanceBadge attendance={a} />
            <MethodTag method={a.method} />
          </div>
        )}
      </div>

      {/* Where — the old app's "Service location" card. */}
      {session.service.venueName && (
        <div className="rounded-lg bg-mist px-4 py-3 flex items-center gap-3 mb-3">
          <MapPin size={16} className="text-purple-brand flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[10px] font-body font-semibold uppercase tracking-wider text-ink/45">Venue</p>
            <p className="text-sm font-body text-ink font-medium truncate">{session.service.venueName}</p>
          </div>
          {!gps && <span className="ml-auto text-[11px] font-body text-ink/45 inline-flex items-center gap-1"><MapPinOff size={12} aria-hidden="true" /> QR code only</span>}
        </div>
      )}

      {/* In · out · time spent — counting while they're in. */}
      <dl className="grid grid-cols-3 rounded-lg border border-purple-brand/8 divide-x divide-purple-brand/8 text-center">
        <Stat label="Clock in" value={a ? formatTime(a.clockInAt) : '—'} />
        <Stat label="Clock out" value={a?.clockOutAt ? formatTime(a.clockOutAt) : a?.autoClockedOut ? 'Missed' : '—'} />
        <Stat label="Time spent"
          value={minutesIn !== null ? formatDuration(minutesIn) : a?.minutesPresent != null ? formatDuration(a.minutesPresent) : '—'}
          live={minutesIn !== null} />
      </dl>

      <div className="mt-4 space-y-3">
        {a?.autoClockedOut && (
          <p className="flex items-start gap-2 text-sm font-body text-[#8a6d1f]">
            <TriangleAlert size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            You didn’t clock out. Your attendance still counts.
          </p>
        )}
        {a?.leftEarlyMinutes > 0 && <p className="text-xs font-body text-ink/50">Left {formatDuration(a.leftEarlyMinutes)} before the end.</p>}
        {a?.short && <p className="text-xs font-body text-ink/50">Shorter than a full attendance.</p>}
        {canOut && <p className="text-xs font-body text-ink/50 text-center">Remember to clock out before you leave.</p>}
        {a && !out && !canOut && <p className="text-sm font-body text-ink/55">Clock-out has closed — your attendance is recorded.</p>}

        {gps && (canIn || canOut) && !outcome && (
          // GPS indoors can be poor; the code on the screen at church always works.
          <p className="text-center">
            <button type="button" onClick={onTypeCode} className="inline-flex items-center gap-1.5 text-xs font-body text-ink/45 hover:text-purple-brand hover:underline">
              <Keyboard size={13} aria-hidden="true" /> GPS not working? Type the code from the screen at church
            </button>
          </p>
        )}

        <Outcome outcome={outcome} onTypeCode={onTypeCode} />
      </div>
    </article>
  );
}

/**
 * The big round button, as in the old app — gold to clock in, deep purple to
 * clock out (with the time so far), a calm tick when done — and, when it can't
 * be pressed, saying why: when clock-in opens, or that it has closed.
 */
function BigButton({ phase, a, out, canIn, canOut, gps, mine, acting, now, session, minutesIn, onClockIn, onClockOut, onTypeCode }) {
  const base = 'w-44 h-44 sm:w-48 sm:h-48 rounded-full flex flex-col items-center justify-center gap-2 text-center transition-all duration-200 font-body select-none';
  const busyLabel = acting?.stage === 'locating' ? 'Finding your location…' : acting?.action === 'out' ? 'Clocking you out…' : 'Clocking you in…';

  if (canIn) {
    return (
      <button type="button" onClick={gps ? onClockIn : onTypeCode} disabled={Boolean(acting)}
        className={`${base} bg-gold text-purple-deep ring-8 ring-gold/20 shadow-[0_10px_40px_rgba(201,168,76,0.45)] hover:bg-gold-light active:scale-95 disabled:opacity-80`}>
        {mine ? <><Spinner size={34} /><span className="text-sm font-semibold px-6">{busyLabel}</span></> : (
          <>
            {gps ? <LogIn size={40} strokeWidth={1.75} aria-hidden="true" /> : <QrCode size={40} strokeWidth={1.75} aria-hidden="true" />}
            <span className="text-lg font-semibold">{gps ? 'Clock in' : 'Clock in with the code'}</span>
            {phase === 'open' && <span className="text-xs text-purple-deep/70">Starts {formatTime(session.startsAt)}</span>}
          </>
        )}
      </button>
    );
  }
  if (canOut) {
    return (
      <button type="button" onClick={gps ? onClockOut : onTypeCode} disabled={Boolean(acting)}
        className={`${base} bg-purple-deep text-white ring-8 ring-gold/30 shadow-[0_10px_40px_rgba(33,10,74,0.35)] hover:bg-purple-brand active:scale-95 disabled:opacity-80`}>
        {mine ? <><Spinner size={34} className="text-gold" /><span className="text-sm font-semibold px-6">{busyLabel}</span></> : (
          <>
            {gps ? <LogOut size={40} strokeWidth={1.75} className="text-gold" aria-hidden="true" /> : <QrCode size={40} strokeWidth={1.75} className="text-gold" aria-hidden="true" />}
            <span className="text-lg font-semibold">{gps ? 'Clock out' : 'Clock out with the code'}</span>
            <span className="text-xs text-white/60 tabular-nums" aria-live="off">{formatDuration(minutesIn ?? 0)} so far</span>
          </>
        )}
      </button>
    );
  }
  if (a && out) {
    return (
      <div className={`${base} bg-green-50 ring-8 ring-green-100 text-green-800`} role="status">
        <CircleCheck size={40} strokeWidth={1.75} aria-hidden="true" />
        <span className="text-lg font-semibold">Done</span>
        <span className="text-xs text-green-800/70">{a.minutesPresent != null ? formatDuration(a.minutesPresent) : 'Attendance recorded'}</span>
      </div>
    );
  }
  if (!a && phase === 'upcoming') {
    return (
      <div className={`${base} bg-mist ring-8 ring-purple-brand/5 text-ink/60`} role="status">
        <Lock size={34} strokeWidth={1.75} aria-hidden="true" />
        <span className="text-sm font-semibold text-ink/70">Clock-in opens<br />at {formatTime(session.window.opensAt)}</span>
        <span className="text-xs text-ink/45">{formatWait(Date.parse(session.window.opensAt) - now)}</span>
      </div>
    );
  }
  return (
    <div className={`${base} bg-mist ring-8 ring-purple-brand/5 text-ink/55`} role="status">
      <Lock size={34} strokeWidth={1.75} aria-hidden="true" />
      <span className="text-sm font-semibold px-6">{a ? 'Clock-out has closed' : 'Clock-in has closed'}</span>
      {!a && <span className="text-xs text-ink/45 px-8">You didn’t clock in to this service.</span>}
    </div>
  );
}

function Stat({ label, value, live = false }) {
  return (
    <div className="py-3 px-1">
      <dt className="text-[10px] font-body font-semibold uppercase tracking-wider text-ink/45">{label}</dt>
      <dd className={`font-display text-xl leading-tight mt-0.5 tabular-nums ${live ? 'text-purple-brand' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}

/** The answer to the last try, kindly — and the QR code whenever GPS was the trouble. */
function Outcome({ outcome, onTypeCode }) {
  if (!outcome) return null;
  if (outcome.kind === 'success') return <Alert kind="success">{outcome.message || 'Done.'}</Alert>;

  if (outcome.kind === 'location') {
    const p = locationProblem(outcome.problem);
    return (
      <div className="space-y-3" role="alert">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-body text-red-800 space-y-1.5">
          <p className="font-semibold">{p.title}</p>
          <p>{p.text}</p>
          {p.steps && <p className="text-red-800/80">{p.steps}</p>}
        </div>
        <QrHint onType={onTypeCode} />
      </div>
    );
  }

  const gpsTrouble = outcome.code === 'TOO_FAR' || outcome.code === 'NO_LOCATION'
    || outcome.field === 'latitude' || outcome.field === 'longitude';
  const rough = outcome.code === 'TOO_FAR' && outcome.accuracy > 75;
  return (
    <div className="space-y-3">
      <Alert>
        {outcome.message}
        {rough && (
          <span className="block mt-1">
            Your phone’s location is only accurate to about {Math.round(outcome.accuracy)} m just now — stepping outside or turning on Wi-Fi can help.
          </span>
        )}
      </Alert>
      {gpsTrouble && <QrHint onType={onTypeCode} />}
    </div>
  );
}

/** The next service, when today has nothing more to come. */
function NextCard({ session, today, hadToday }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className="w-11 h-11 rounded-full bg-purple-brand/8 ring-1 ring-purple-brand/15 flex items-center justify-center flex-shrink-0">
        <CalendarDays size={20} className="text-purple-brand" />
      </div>
      <div className="min-w-0">
        <p className="label">{hadToday ? 'Next service' : 'No service today — next is'}</p>
        <p className="font-display text-xl text-ink leading-tight mt-0.5">{session.service.name}</p>
        <p className="text-sm font-body text-ink/60 mt-0.5">
          {relativeDay(session.date, today)} · {formatTimeRange(session.startsAt, session.endsAt)}
        </p>
        {session.service.venueName && <p className="text-sm font-body text-ink/45">{session.service.venueName}</p>}
        <p className="text-xs font-body text-ink/45 mt-1">Clock-in opens at {formatTime(session.window.opensAt)}.</p>
      </div>
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, text, highlight }) {
  return (
    <Link to={to} className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow group">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ring-1 ${
        highlight ? 'bg-gold/15 ring-gold/30' : 'bg-purple-brand/8 ring-purple-brand/15'}`}>
        <Icon size={20} className={highlight ? 'text-gold' : 'text-purple-brand'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-body font-semibold text-ink text-sm">{title}</p>
        <p className={`font-body text-sm ${highlight ? 'text-[#8a6d1f]' : 'text-ink/50'}`}>{text}</p>
      </div>
      <ChevronRight size={18} className="text-ink/25 group-hover:text-ink/50" />
    </Link>
  );
}
