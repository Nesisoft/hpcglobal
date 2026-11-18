import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, UserCheck, Trash2 } from 'lucide-react';
import { Alert, Field, Modal, Spinner } from './ui';
import { AttendanceBadge, MethodTag } from './clock';
import { api } from '../lib/api';
import { useForm } from '../lib/useForm';
import { accraToday, addDays, formatDay, formatTime, formatTimeRange, toTimeInput } from '../lib/format';

const STATE = {
  notIn:    { label: 'Not in yet', tone: 'bg-ink/5 text-ink/60 border-ink/10' },
  absent:   { label: 'Absent', tone: 'bg-red-50 text-red-700 border-red-200' },
  excused:  { label: 'On leave', tone: 'bg-purple-brand/8 text-purple-brand border-purple-brand/15' },
  upcoming: { label: 'Not started', tone: 'bg-ink/5 text-ink/45 border-ink/10' },
};

export function RegisterState({ state }) {
  const s = STATE[state];
  if (!s) return null;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-body font-medium whitespace-nowrap ${s.tone}`}>{s.label}</span>;
}

/** "12 in · 3 not in yet · 1 on leave" from a register's counts. */
export function countsLine(counts = {}) {
  const parts = [`${counts.present ?? 0} present`];
  if (counts.notIn) parts.push(`${counts.notIn} not in yet`);
  if (counts.absent) parts.push(`${counts.absent} absent`);
  if (counts.excused) parts.push(`${counts.excused} on leave`);
  return parts.join(' · ');
}

/**
 * The rows of one register: each person, present (how and when), on leave,
 * absent or not in yet — with marking by hand where `markUrl` is given and
 * the date is recent enough, and removing where `canRemove` allows.
 */
export function RegisterRows({ data, markUrl, removeUrl, canRemove, onChanged, showDepartment = false }) {
  const [marking, setMarking] = useState(null);
  const [removing, setRemoving] = useState(null);
  const s = data.session;
  const markable = markUrl && !s.cancelled && new Date(s.startsAt) <= new Date()
    && s.date >= addDays(accraToday(), -data.markDaysBack);

  if (!data.rows.length) return <p className="py-8 text-center text-sm font-body text-ink/45">Nobody to show.</p>;
  return (
    <>
      <ul className="divide-y divide-purple-brand/5">
        {data.rows.map((r) => (
          <li key={r.worker.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-body font-medium text-ink truncate">{r.worker.name}</p>
              {showDepartment && <p className="text-xs font-body text-ink/45 truncate">{r.worker.department?.name ?? 'No department'}</p>}
            </div>
            {r.attendance ? (
              <>
                <p className="text-sm font-body text-ink/65 sm:w-52">
                  In {formatTime(r.attendance.clockInAt)}
                  {r.attendance.autoClockedOut ? <span className="text-[#8a6d1f]"> · didn’t clock out</span>
                    : r.attendance.clockOutAt ? <> · Out {formatTime(r.attendance.clockOutAt)}</>
                      : r.attendance.method === 'MANUAL' ? null
                        : <span className="text-green-700"> · still in</span>}
                </p>
                <div className="flex items-center gap-2 sm:w-72">
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    <AttendanceBadge attendance={r.attendance} />
                    <MethodTag method={r.attendance.method} />
                    {r.attendance.markedByName && <span className="text-[11px] font-body text-ink/40">by {r.attendance.markedByName}</span>}
                  </div>
                  {removeUrl && canRemove(r.attendance) && markable && (
                    <button onClick={() => setRemoving(r)} className="flex-shrink-0 p-1.5 rounded text-ink/35 hover:text-red-600 hover:bg-red-50 print:hidden"
                      aria-label={`Remove ${r.worker.name}’s attendance`} title="Remove">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 sm:w-[33rem] sm:justify-end">
                <RegisterState state={r.state} />
                {markable && r.state !== 'upcoming' && (
                  <button onClick={() => setMarking(r)} className="btn-outline px-3 py-1.5 text-xs ml-auto sm:ml-0 print:hidden">
                    <UserCheck size={13} /> Mark present
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {marking && (
        <MarkDialog row={marking} session={s} url={markUrl}
          onClose={() => setMarking(null)} onDone={async () => { setMarking(null); await onChanged(); }} />
      )}
      {removing && (
        <RemoveDialog row={removing} url={removeUrl(removing.attendance)}
          onClose={() => setRemoving(null)} onDone={async () => { setRemoving(null); await onChanged(); }} />
      )}
    </>
  );
}

/** One date's register, loaded from `url`, in a card with its own refresh. */
export function Register({ url, title, ...rowProps }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const load = useCallback(async () => {
    const n = ++latest.current;
    setLoading(true); setError('');
    try {
      const res = await api.get(url);
      if (n === latest.current) setData(res);
    } catch (err) {
      if (n === latest.current) setError(err.message);
    } finally {
      if (n === latest.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          {title ?? (data && (
            <>
              <h2 className="font-display text-2xl text-ink font-light leading-tight">{data.session.service.name}</h2>
              <p className="text-sm font-body text-ink/55">
                {formatDay(data.session.date)} · {formatTimeRange(data.session.startsAt, data.session.endsAt)}
                {data.session.cancelled && <span className="text-red-600"> · cancelled</span>}
                {!data.expected && <span> · optional service</span>}
              </p>
            </>
          ))}
          {data && <p className="text-sm font-body text-ink/75 mt-1">{countsLine(data.counts)}</p>}
        </div>
        <button type="button" className="btn-outline px-3 py-2 text-xs flex-shrink-0 print:hidden" onClick={load} disabled={loading} aria-label="Refresh">
          {loading ? <Spinner size={13} /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>
      <Alert>{error}</Alert>
      {!data ? (!error && <div className="py-10 flex justify-center text-purple-brand"><Spinner size={22} /></div>)
        : <RegisterRows data={data} onChanged={load} {...rowProps} />}
    </section>
  );
}

function MarkDialog({ row, session, url, onClose, onDone }) {
  const { values, set, errors, formError, busy, submit } = useForm({
    arrivedAt: toTimeInput(session.startsAt), leftAt: '', reason: '',
  });
  async function send(e) {
    e.preventDefault();
    const ok = await submit(() => api.post(url, { workerId: row.worker.id, ...values, leftAt: values.leftAt || null }));
    if (ok) await onDone();
  }
  return (
    <Modal title={`Mark ${row.worker.name} present`} onClose={onClose} busy={busy}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
        <button type="submit" form="mark-present" disabled={busy} className="btn-primary">{busy ? <Spinner size={15} /> : 'Mark present'}</button>
      </>}>
      <form id="mark-present" onSubmit={send} className="space-y-4" noValidate>
        <Alert>{formError}</Alert>
        <p className="text-sm font-body text-ink/65">
          {session.service.name}, {formatDay(session.date)}. The arrival time decides on time or late, as a clock-in would. This is recorded with your name.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Arrived" error={errors.arrivedAt} required htmlFor="mark-in">
            <input id="mark-in" type="time" className="input" value={values.arrivedAt} onChange={set('arrivedAt')} />
          </Field>
          <Field label="Left (if known)" error={errors.leftAt} htmlFor="mark-out">
            <input id="mark-out" type="time" className="input" value={values.leftAt} onChange={set('leftAt')} />
          </Field>
        </div>
        <Field label="Reason" error={errors.reason} required htmlFor="mark-reason" hint="For example: “Phone battery died — I saw her ushering.”">
          <textarea id="mark-reason" className="input min-h-[80px]" maxLength={300} value={values.reason} onChange={set('reason')} />
        </Field>
      </form>
    </Modal>
  );
}

function RemoveDialog({ row, url, onClose, onDone }) {
  const { values, set, errors, formError, busy, submit } = useForm({ reason: '' });
  async function send(e) {
    e.preventDefault();
    const ok = await submit(() => api.post(url, values));
    if (ok) await onDone();
  }
  return (
    <Modal title={`Remove ${row.worker.name}’s attendance?`} onClose={onClose} busy={busy}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
        <button type="submit" form="remove-attendance" disabled={busy} className="btn-danger">{busy ? <Spinner size={15} /> : 'Remove'}</button>
      </>}>
      <form id="remove-attendance" onSubmit={send} className="space-y-4" noValidate>
        <Alert>{formError}</Alert>
        <p className="text-sm font-body text-ink/65">They’ll count as absent for this service. The record and your reason are kept in the audit log.</p>
        <Field label="Reason" error={errors.reason} required htmlFor="remove-reason">
          <textarea id="remove-reason" className="input min-h-[80px]" maxLength={300} value={values.reason} onChange={set('reason')} />
        </Field>
      </form>
    </Modal>
  );
}
