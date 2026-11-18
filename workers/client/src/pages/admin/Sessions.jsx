import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus, ChevronLeft, ChevronRight, QrCode, Users, Clock, StickyNote, Ban, RotateCcw, MapPinOff, RefreshCw,
} from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Empty, Field, Modal, PageHeader, Spinner } from '../../components/ui';
import { AttendanceBadge, MethodTag, PhaseChip, phaseAt, useNow } from '../../components/clock';
import { api, qs } from '../../lib/api';
import { useForm } from '../../lib/useForm';
import {
  accraToday, addDays, formatDay, formatTime, formatTimeRange, relativeDay, toTimeInput,
} from '../../lib/format';

// The API's own range is a week back and two weeks ahead, today included:
// 22 days. Earlier and Later move by all 22, so no day shows on two pages.
const BACK = 7;
const AHEAD = 14;
const STEP = BACK + AHEAD + 1;

/** The dates page `page` asks for, counted from `today`. */
const pageRange = (today, page) => ({
  from: addDays(today, -BACK + STEP * page),
  to: addDays(today, AHEAD + STEP * page),
});

/**
 * Each date of each service: today's first, then what's coming, then the
 * recent past. From here the office changes a date's times, cancels it,
 * leaves a note, puts the QR code on a screen and sees who has clocked in.
 */
export default function Sessions() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [services, setServices] = useState(null);
  const [dialog, setDialog] = useState(null);   // { type, session }
  const now = useNow(30000);
  const today = accraToday(now);

  // The dates shown: as the server answered (it may shorten a long range),
  // or as asked while the answer is on its way.
  const asked = pageRange(today, page);
  const range = data?.from && data?.to ? { from: data.from, to: data.to } : asked;

  // Only the latest request's answer is shown, so paging quickly never
  // leaves one range's dates under another range's heading.
  const requests = useRef(0);
  const load = useCallback(async () => {
    const n = ++requests.current;
    setError('');
    try {
      const params = page === 0 ? {} : pageRange(accraToday(), page);
      const res = await api.get(`/admin/sessions${qs(params)}`);
      if (n === requests.current) setData(res);
    } catch (err) {
      if (n === requests.current) setError(err.message);
    }
  }, [page]);
  useEffect(() => { setData(null); load(); }, [load]);
  // A failed load is kept as an error, not as "no services", so Add a date
  // never tells the office to add services that are already there.
  const [servicesError, setServicesError] = useState('');
  const loadServices = useCallback(() => {
    setServicesError('');
    api.get('/admin/services').then((r) => setServices(r.services)).catch((err) => setServicesError(err.message));
  }, []);
  useEffect(() => { loadServices(); }, [loadServices]);

  const groups = useMemo(() => {
    const byDate = new Map();
    for (const s of data?.sessions ?? []) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date).push(s);
    }
    const dates = [...byDate.keys()].sort();
    return {
      coming: dates.filter((d) => d >= today).map((d) => [d, byDate.get(d)]),
      earlier: dates.filter((d) => d < today).reverse().map((d) => [d, byDate.get(d)]),
    };
  }, [data, today]);

  const open = (type, session) => { setNotice(''); setDialog({ type, session }); };
  const close = () => setDialog(null);
  const done = async (message) => { setDialog(null); setNotice(message); await load(); };

  return (
    <AppShell title="Sessions">
      <PageHeader title="Sessions" subtitle="Each date of each service — show the QR code, see who’s in, or change a date.">
        <button type="button" className="btn-primary px-4 py-2.5" onClick={() => open('add')}><CalendarPlus size={15} /> Add a date</button>
      </PageHeader>

      <div className="flex items-center justify-between gap-3 mb-5">
        <button type="button" className="btn-outline px-3 py-2.5" aria-label="Earlier dates" onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft size={16} />
        </button>
        <div className="text-center min-w-0">
          <p className="text-sm font-body font-semibold text-ink">
            {formatDay(range.from, { short: true })} – {formatDay(range.to, { short: true, year: range.to.slice(0, 4) !== today.slice(0, 4) })}
          </p>
          {page !== 0 && (
            <button type="button" className="text-xs font-body text-purple-brand hover:underline" onClick={() => setPage(0)}>Back to this week</button>
          )}
        </div>
        <button type="button" className="btn-outline px-3 py-2.5" aria-label="Later dates" onClick={() => setPage((p) => p + 1)}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="space-y-3 mb-4">
        <Alert>{error}</Alert>
        {notice && <Alert kind="success">{notice}</Alert>}
      </div>

      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.sessions.length === 0 ? (
        <Empty>
          {services && !services.some((s) => s.active)
            ? <>No services yet. <Link to="/admin/services" className="text-purple-brand hover:underline">Add a service</Link> and its dates appear here.</>
            : 'No sessions in these dates.'}
        </Empty>
      ) : (
        <div className="space-y-8">
          {groups.coming.length > 0 && (
            <DateGroups title={page < 0 ? null : 'Today and coming up'} groups={groups.coming} today={today} now={now} onAction={open} />
          )}
          {groups.earlier.length > 0 && (
            <DateGroups title={page > 0 ? null : 'Earlier'} groups={groups.earlier} today={today} now={now} onAction={open} />
          )}
        </div>
      )}

      {dialog?.type === 'add' && (
        <AddDialog services={services} servicesError={servicesError} onRetry={loadServices} today={today} onClose={close} onDone={done} />
      )}
      {dialog?.type === 'times' && <TimesDialog session={dialog.session} onClose={close} onDone={done} />}
      {dialog?.type === 'note' && <NoteDialog session={dialog.session} onClose={close} onDone={done} />}
      {(dialog?.type === 'cancel' || dialog?.type === 'restore') && (
        <CancelDialog session={dialog.session} restore={dialog.type === 'restore'} onClose={close} onDone={done} />
      )}
      {dialog?.type === 'who' && <WhosIn session={dialog.session} onClose={close} />}
    </AppShell>
  );
}

function DateGroups({ title, groups, today, now, onAction }) {
  return (
    <section>
      {title && <h2 className="font-display text-2xl text-ink mb-3">{title}</h2>}
      <div className="space-y-5">
        {groups.map(([date, sessions]) => (
          <div key={date}>
            <h3 className={`text-xs font-body font-semibold uppercase tracking-[0.15em] mb-2 ${date === today ? 'text-gold' : 'text-ink/45'}`}>
              {relativeDay(date, today)}{date === today || date === addDays(today, 1) || date === addDays(today, -1) ? ` · ${formatDay(date)}` : ''}
            </h3>
            <ul className="card divide-y divide-purple-brand/5">
              {sessions.map((s) => <SessionRow key={s.id} session={s} today={today} now={now} onAction={onAction} />)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Opened from the home screen icon, not in a browser tab. */
const installed = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function SessionRow({ session: s, today, now, onAction }) {
  const phase = phaseAt(s, now);
  const future = s.date > today;
  const clockedIn = s.counts?.clockedIn ?? 0;
  // The code works from when clock-in opens until clock-out closes; today's
  // later sessions can be put up early, and the screen shows the code by
  // itself once clock-in opens.
  const canShowQr = !s.cancelled && s.date === today && now < Date.parse(s.window.clockOutUntil);
  const label = phase === 'upcoming' && future ? 'Upcoming' : undefined;

  return (
    <li className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-body font-semibold ${s.cancelled ? 'text-ink/45 line-through' : 'text-ink'}`}>{s.service.name}</p>
          <p className="text-sm font-body text-ink/55">
            {formatTimeRange(s.startsAt, s.endsAt)}
            {s.service.venueName && <span className="text-ink/40"> · {s.service.venueName}</span>}
          </p>
          {!s.service.hasLocation && !s.cancelled && (
            <p className="text-xs font-body text-[#8a6d1f] flex items-center gap-1.5 mt-0.5">
              <MapPinOff size={12} aria-hidden="true" /> No venue location — workers clock in with the QR code
            </p>
          )}
          {s.note && <p className="text-sm font-body text-ink/60 italic mt-1">“{s.note}”</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <PhaseChip phase={phase} cancelled={s.cancelled} label={s.cancelled ? undefined : label} />
          {s.custom && <span className="text-[10px] font-body uppercase tracking-wider text-ink/40">Changed</span>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm font-body text-ink/60 flex items-center gap-1.5">
          <Users size={14} className="text-ink/35" aria-hidden="true" />
          {future ? 'Not started yet' : `${clockedIn} clocked in`}
        </p>
        <div className="flex flex-wrap gap-2">
          {canShowQr && (installed() ? (
            // A new tab from the installed app opens in Safari, which doesn't
            // have the app's sign-in; so here it opens in the same window.
            <Link to={`/display/${s.id}`} state={{ from: '/admin/sessions' }} className="btn-primary px-3 py-2 text-xs">
              <QrCode size={13} /> Show QR
            </Link>
          ) : (
            // A real link, so the browser opens the new tab without a pop-up warning.
            <a href={`/display/${s.id}`} target="_blank" rel="noopener noreferrer" className="btn-primary px-3 py-2 text-xs">
              <QrCode size={13} /> Show QR
            </a>
          ))}
          {!future && (
            <button type="button" className="btn-outline px-3 py-2 text-xs" onClick={() => onAction('who', s)}><Users size={13} /> Who’s in</button>
          )}
          {!s.cancelled && (
            <button type="button" className="btn-outline px-3 py-2 text-xs" onClick={() => onAction('times', s)}><Clock size={13} /> Times</button>
          )}
          <button type="button" className="btn-outline px-3 py-2 text-xs" onClick={() => onAction('note', s)}><StickyNote size={13} /> Note</button>
          {s.cancelled
            ? <button type="button" className="btn-outline px-3 py-2 text-xs" onClick={() => onAction('restore', s)}><RotateCcw size={13} /> Restore</button>
            : <button type="button" className="btn-outline-danger px-3 py-2 text-xs" onClick={() => onAction('cancel', s)}><Ban size={13} /> Cancel</button>}
        </div>
      </div>
    </li>
  );
}

const sessionName = (s) => `${s.service.name} on ${formatDay(s.date, { short: true })}`;

function TimesDialog({ session, onClose, onDone }) {
  const before = { startTime: toTimeInput(session.startsAt), endTime: toTimeInput(session.endsAt) };
  const form = useForm(before);

  async function save(e) {
    e?.preventDefault();
    const changed = Object.fromEntries(Object.entries(form.values).filter(([k, v]) => v !== before[k]));
    if (!Object.keys(changed).length) { onClose(); return; }
    const res = await form.submit(() => api.patch(`/admin/sessions/${session.id}`, changed));
    if (res) await onDone(`${sessionName(session)} now runs ${formatTimeRange(res.session.startsAt, res.session.endsAt)}.`);
  }

  return (
    <Modal title="Change the times" onClose={onClose} busy={form.busy}
      footer={<>
        <button type="button" className="btn-outline" onClick={onClose} disabled={form.busy}>Cancel</button>
        <button type="button" className="btn-primary" onClick={save} disabled={form.busy}>{form.busy ? <Spinner size={15} /> : 'Save'}</button>
      </>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <p className="text-sm font-body text-ink/65">For {sessionName(session)} only. The service’s usual times stay as they are.</p>
        <Alert>{form.formError}</Alert>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Starts" error={form.errors.startTime}>
            <input className="input" type="time" value={form.values.startTime} onChange={form.set('startTime')} />
          </Field>
          <Field label="Ends" error={form.errors.endTime}>
            <input className="input" type="time" value={form.values.endTime} onChange={form.set('endTime')} />
          </Field>
        </div>
        {session.counts?.clockedIn > 0 && (
          <p className="text-xs font-body text-ink/45">Workers already clocked in keep the times they clocked in at.</p>
        )}
      </form>
    </Modal>
  );
}

function NoteDialog({ session, onClose, onDone }) {
  const form = useForm({ note: session.note ?? '' });

  async function save(e) {
    e?.preventDefault();
    const note = form.values.note.trim() || null;
    if (note === (session.note ?? null)) { onClose(); return; }
    const res = await form.submit(() => api.patch(`/admin/sessions/${session.id}`, { note }));
    if (res) await onDone(note ? `Note saved for ${sessionName(session)}.` : `Note removed from ${sessionName(session)}.`);
  }

  return (
    <Modal title="Note" onClose={onClose} busy={form.busy}
      footer={<>
        <button type="button" className="btn-outline" onClick={onClose} disabled={form.busy}>Cancel</button>
        <button type="button" className="btn-primary" onClick={save} disabled={form.busy}>{form.busy ? <Spinner size={15} /> : 'Save'}</button>
      </>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <Alert>{form.formError}</Alert>
        <Field label={`Note for ${sessionName(session)}`} error={form.errors.note} hint="Workers see it under the service on their Home page. Leave empty to remove it.">
          <textarea className="input min-h-[90px]" maxLength={300} value={form.values.note} onChange={form.set('note')} autoFocus
            placeholder="For example: “Combined service at the main auditorium.”" />
        </Field>
      </form>
    </Modal>
  );
}

function CancelDialog({ session, restore, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clockedIn = session.counts?.clockedIn ?? 0;

  async function confirm() {
    setBusy(true); setError('');
    try {
      await api.patch(`/admin/sessions/${session.id}`, { cancelled: !restore });
      await onDone(restore ? `${sessionName(session)} is back on.` : `${sessionName(session)} is cancelled.`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal title={restore ? `Restore ${sessionName(session)}?` : `Cancel ${sessionName(session)}?`} onClose={onClose} busy={busy}
      footer={<>
        <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>{restore ? 'Not now' : 'Keep it'}</button>
        <button type="button" className={restore ? 'btn-primary' : 'btn-danger'} onClick={confirm} disabled={busy}>
          {busy ? <Spinner size={15} /> : restore ? 'Restore' : 'Cancel this date'}
        </button>
      </>}>
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <p className="text-sm font-body text-ink/65">
          {restore
            ? 'Workers can clock in to it again, and it shows on their Home page.'
            : 'It disappears from workers’ Home page and nobody can clock in to it. You can restore it later.'}
        </p>
        {!restore && clockedIn > 0 && (
          <p className="text-sm font-body text-[#8a6d1f]">
            {clockedIn} {clockedIn === 1 ? 'worker has' : 'workers have'} already clocked in — {clockedIn === 1 ? 'that record stays' : 'their records stay'}.
          </p>
        )}
      </div>
    </Modal>
  );
}

function AddDialog({ services, servicesError, onRetry, today, onClose, onDone }) {
  const active = (services ?? []).filter((s) => s.active);
  const first = active[0];
  const form = useForm({
    serviceId: first?.id ?? '', date: today,
    startTime: first?.startTime ?? '07:00', endTime: first?.endTime ?? '09:30', note: '',
  });
  const v = form.values;

  // The services may still be on their way when the dialog opens.
  useEffect(() => {
    if (!v.serviceId && first) {
      form.setValues((x) => ({ ...x, serviceId: first.id, startTime: first.startTime ?? x.startTime, endTime: first.endTime ?? x.endTime }));
    }
  }, [first]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picking a service brings its usual times, to change if need be.
  function pickService(e) {
    const service = active.find((s) => String(s.id) === e.target.value);
    form.setValues((x) => ({
      ...x, serviceId: e.target.value,
      startTime: service?.startTime ?? x.startTime, endTime: service?.endTime ?? x.endTime,
    }));
  }

  async function save(e) {
    e?.preventDefault();
    const service = active.find((s) => String(s.id) === String(v.serviceId));
    const body = { serviceId: service?.id ?? v.serviceId, date: v.date, startTime: v.startTime, endTime: v.endTime, note: v.note.trim() || undefined };
    const res = await form.submit(() => api.post('/admin/sessions', body));
    if (res) await onDone(`${service?.name ?? 'The service'} added on ${formatDay(v.date, { short: true })}.`);
  }

  return (
    <Modal title="Add a date" onClose={onClose} busy={form.busy}
      footer={<>
        <button type="button" className="btn-outline" onClick={onClose} disabled={form.busy}>Cancel</button>
        <button type="button" className="btn-primary" onClick={save} disabled={form.busy || !active.length}>{form.busy ? <Spinner size={15} /> : 'Add'}</button>
      </>}>
      {!services && servicesError ? (
        <div className="space-y-4">
          <Alert>We couldn’t load the services. {servicesError}</Alert>
          <button type="button" className="btn-outline px-4 py-2.5" onClick={onRetry}><RotateCcw size={15} /> Try again</button>
        </div>
      ) : !services ? (
        <div className="py-10 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : !active.length ? (
        <p className="text-sm font-body text-ink/65">
          There are no services yet. <Link to="/admin/services" className="text-purple-brand hover:underline">Add a service</Link> first.
        </p>
      ) : (
        <form onSubmit={save} className="space-y-4" noValidate>
          <p className="text-sm font-body text-ink/65">An extra date for a service — a special Sunday, an extra rehearsal.</p>
          <Alert>{form.formError}</Alert>
          <Field label="Service" error={form.errors.serviceId}>
            <select className="input" value={v.serviceId} onChange={pickService}>
              {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Date" error={form.errors.date}>
            <input className="input" type="date" value={v.date} min={today} onChange={form.set('date')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts" error={form.errors.startTime}>
              <input className="input" type="time" value={v.startTime} onChange={form.set('startTime')} />
            </Field>
            <Field label="Ends" error={form.errors.endTime}>
              <input className="input" type="time" value={v.endTime} onChange={form.set('endTime')} />
            </Field>
          </div>
          <Field label="Note (optional)" error={form.errors.note}>
            <input className="input" maxLength={300} value={v.note} onChange={form.set('note')} />
          </Field>
        </form>
      )}
    </Modal>
  );
}

/** A department given as its name or as `{ id, name }`. */
const departmentName = (d) => (typeof d === 'string' ? d : d?.name) || null;

/** Everyone who clocked in to one date, as it stands — refreshable during the service. */
function WhosIn({ session, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requests = useRef(0);
  const load = useCallback(async () => {
    const n = ++requests.current;
    setLoading(true); setError('');
    try {
      const res = await api.get(`/admin/sessions/${session.id}/attendance`);
      if (n === requests.current) setData(res);
    } catch (err) {
      if (n === requests.current) setError(err.message);
    } finally {
      if (n === requests.current) setLoading(false);
    }
  }, [session.id]);
  useEffect(() => { load(); }, [load]);

  const list = data?.attendance ?? [];
  const stillIn = list.filter((a) => !a.clockOutAt && !a.autoClockedOut && a.method !== 'MANUAL').length;
  const late = list.filter((a) => a.status && a.status !== 'ON_TIME').length;

  return (
    <Modal title={`Who’s in — ${session.service.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-body text-ink/55">
            {formatDay(session.date)} · {formatTimeRange(session.startsAt, session.endsAt)}
            {data && <><br /><span className="text-ink/75">{list.length} clocked in · {stillIn} still in · {late} late</span></>}
          </p>
          <button type="button" className="btn-outline px-3 py-2 text-xs flex-shrink-0" onClick={load} disabled={loading} aria-label="Refresh the list">
            {loading ? <Spinner size={13} /> : <RefreshCw size={13} />} Refresh
          </button>
        </div>
        <Alert>{error}</Alert>
        <Link to={`/admin/register/${session.id}`} className="inline-flex items-center gap-1.5 text-sm font-body text-purple-brand hover:underline">
          Full register — who didn’t come, marking in and corrections <ChevronRight size={14} />
        </Link>
        {!data ? (
          !error && <div className="py-10 flex justify-center text-purple-brand"><Spinner size={22} /></div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm font-body text-ink/45">Nobody has clocked in yet.</p>
        ) : (
          <ul className="divide-y divide-purple-brand/5 -mx-1">
            {list.map((a) => (
              <li key={a.id} className="px-1 py-3 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-body font-medium text-ink truncate">{a.worker?.name ?? 'Worker'}</p>
                  <p className="text-xs font-body text-ink/45 truncate">{departmentName(a.worker?.department) ?? 'No department'}</p>
                </div>
                <p className="text-sm font-body text-ink/65 sm:w-56">
                  In {formatTime(a.clockInAt)}
                  {a.autoClockedOut ? <span className="text-[#8a6d1f]"> · didn’t clock out</span>
                    : a.clockOutAt ? <> · Out {formatTime(a.clockOutAt)}</>
                      : a.method === 'MANUAL' ? null
                        : <span className="text-green-700"> · still in</span>}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <AttendanceBadge attendance={a} />
                  <MethodTag method={a.method} />
                  {a.method === 'MANUAL' && a.markedByName && <span className="text-[11px] font-body text-ink/40">by {a.markedByName}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
