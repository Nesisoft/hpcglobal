import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCheck, Plus } from 'lucide-react';
import { Alert, Empty, Field, Modal, Spinner } from './ui';
import { api } from '../lib/api';
import { useForm } from '../lib/useForm';
import { formatDate, formatDay } from '../lib/format';

export const TICKET_TYPES = [
  { value: 'LATENESS', label: 'Lateness' },
  { value: 'ABSENCE', label: 'Absence' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'MISCONDUCT', label: 'Misconduct' },
];
const SEVERITY = {
  LOW:    { label: 'Low', tone: 'bg-ink/5 text-ink/60 border-ink/10' },
  MEDIUM: { label: 'Medium', tone: 'bg-gold/15 text-[#8a6d1f] border-gold/30' },
  HIGH:   { label: 'High', tone: 'bg-red-50 text-red-700 border-red-200' },
};

const chip = 'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-body font-medium whitespace-nowrap';

/** One ticket's facts, as the worker and the people who issue them see it. */
export function TicketSummary({ ticket: t, showWorker = false }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        {showWorker && <p className="font-body font-semibold text-ink">{t.worker?.name}</p>}
        <p className={`font-body ${showWorker ? 'text-sm text-ink/60' : 'font-semibold text-ink'}`}>{t.typeLabel}</p>
        <span className={`${chip} ${SEVERITY[t.severity]?.tone ?? ''}`}>{SEVERITY[t.severity]?.label ?? t.severity}</span>
        <span className={`${chip} ${t.resolved ? 'bg-green-50 text-green-700 border-green-200' : 'bg-purple-brand/8 text-purple-brand border-purple-brand/15'}`}>
          {t.resolved ? 'Resolved' : 'Open'}
        </span>
      </div>
      {showWorker && t.worker?.department && <p className="text-xs font-body text-ink/45">{t.worker.department.name}</p>}
      <p className="text-sm font-body text-ink/70 mt-1 break-words">{t.reason}</p>
      <p className="text-xs font-body text-ink/40 mt-1">
        From {t.issuedByName} · {formatDate(t.createdAt)}
        {t.session && <> · {t.session.name}, {formatDay(t.session.date, { short: true })}</>}
      </p>
      {t.resolved && (
        <p className="text-xs font-body text-green-700 mt-1">
          Resolved by {t.resolvedByName} · {formatDate(t.resolvedAt)}{t.resolutionNote && <> — “{t.resolutionNote}”</>}
        </p>
      )}
    </div>
  );
}

const FILTERS = [{ key: 'open', label: 'Open' }, { key: 'resolved', label: 'Resolved' }, { key: '', label: 'All' }];

/**
 * Tickets to see, issue and resolve: a head of department's members'
 * (`base` "/hod") or everyone's ("/admin"). `people` are who a ticket can be
 * issued to; `sessions` the recent services one can be linked to.
 */
export function TicketDesk({ base, selfId, people, sessions, query = '', issueFor, onIssueFor }) {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issuing, setIssuing] = useState(null);
  const [resolving, setResolving] = useState(null);

  const latest = useRef(0);
  const load = useCallback(async () => {
    const n = ++latest.current;
    setError('');
    try {
      const params = new URLSearchParams(query);
      if (status) params.set('status', status);
      const res = await api.get(`${base}/tickets?${params}`);
      if (n === latest.current) setData(res);
    } catch (err) {
      if (n === latest.current) setError(err.message);
    }
  }, [base, status, query]);
  useEffect(() => { setData(null); load(); }, [load]);
  // Opened from somewhere else (a report row) with the form filled in.
  useEffect(() => { if (issueFor) { setIssuing(issueFor); onIssueFor?.(null); } }, [issueFor, onIssueFor]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f.key || 'all'} onClick={() => setStatus(f.key)}
              className={`px-4 py-2 rounded-full text-sm font-body whitespace-nowrap border transition-colors ${
                status === f.key ? 'bg-purple-deep text-white border-purple-deep' : 'bg-white text-ink/60 border-purple-brand/10 hover:border-purple-brand/30'}`}>
              {f.label}
              {f.key === 'open' && data?.open > 0 && (
                <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${status === 'open' ? 'bg-gold text-purple-deep' : 'bg-purple-brand/8'}`}>{data.open}</span>
              )}
            </button>
          ))}
        </div>
        <button onClick={() => { setNotice(''); setIssuing({}); }} className="btn-primary" disabled={!people}>
          <Plus size={16} /> Issue a ticket
        </button>
      </div>
      <div className="space-y-3 mb-4">
        <Alert>{error}</Alert>
        {notice && <Alert kind="success">{notice}</Alert>}
      </div>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.tickets.length === 0 ? (
        <Empty>{status === 'open' ? 'No open tickets.' : 'No tickets here.'}</Empty>
      ) : (
        <ul className="space-y-3">
          {data.tickets.map((t) => (
            <li key={t.id} className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <TicketSummary ticket={t} showWorker />
              {!t.resolved && t.worker?.id !== selfId && (
                <button onClick={() => setResolving(t)} className="btn-outline px-4 py-2 text-sm self-start sm:self-center">
                  <CheckCheck size={15} /> Resolve
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {issuing && people && (
        <IssueDialog base={base} people={people.filter((p) => p.id !== selfId)} sessions={sessions} preset={issuing}
          onClose={() => setIssuing(null)}
          onDone={async (ticket) => { setIssuing(null); setNotice(`Ticket issued to ${ticket.worker.name}. They’ll see it under My record.`); await load(); }} />
      )}
      {resolving && (
        <ResolveDialog ticket={resolving} url={`${base}/tickets/${resolving.id}/resolve`} onClose={() => setResolving(null)}
          onDone={async (message, failed) => { setResolving(null); await load(); if (failed) setError(message); else setNotice(message); }} />
      )}
    </div>
  );
}

function IssueDialog({ base, people, sessions, preset, onClose, onDone }) {
  const { values, set, errors, formError, busy, submit } = useForm({
    workerId: preset.workerId ?? '', type: preset.type ?? 'LATENESS', severity: 'LOW', reason: preset.reason ?? '', sessionId: '',
  });
  async function send(e) {
    e.preventDefault();
    const res = await submit(() => api.post(`${base}/tickets`, { ...values, sessionId: values.sessionId || null }));
    if (res) await onDone(res.ticket);
  }
  return (
    <Modal title="Issue a ticket" onClose={onClose} busy={busy}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
        <button type="submit" form="issue-ticket" disabled={busy} className="btn-primary">{busy ? <Spinner size={15} /> : 'Issue'}</button>
      </>}>
      <form id="issue-ticket" onSubmit={send} className="space-y-4" noValidate>
        <Alert>{formError}</Alert>
        <Field label="Who" error={errors.workerId} required htmlFor="ticket-who">
          <select id="ticket-who" className="input" value={values.workerId} onChange={set('workerId')}>
            <option value="">Choose…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.department && base === '/admin' ? ` — ${p.department.name}` : ''}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind" error={errors.type} required htmlFor="ticket-type">
            <select id="ticket-type" className="input" value={values.type} onChange={set('type')}>
              {TICKET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="How serious" error={errors.severity} required htmlFor="ticket-severity">
            <select id="ticket-severity" className="input" value={values.severity} onChange={set('severity')}>
              {Object.entries(SEVERITY).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        {sessions?.length > 0 && (
          <Field label="Service (optional)" error={errors.sessionId} htmlFor="ticket-session">
            <select id="ticket-session" className="input" value={values.sessionId} onChange={set('sessionId')}>
              <option value="">None</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.service.name} — {formatDay(s.date, { short: true })}</option>)}
            </select>
          </Field>
        )}
        <Field label="Reason" error={errors.reason} required htmlFor="ticket-reason" hint="They will read this.">
          <textarea id="ticket-reason" className="input min-h-[90px]" maxLength={500} value={values.reason} onChange={set('reason')} />
        </Field>
      </form>
    </Modal>
  );
}

function ResolveDialog({ ticket, url, onClose, onDone }) {
  const { values, set, errors, formError, busy, submit } = useForm({ note: '' });
  async function send(e) {
    e.preventDefault();
    // Already resolved (or gone) meanwhile: close and say so on the list.
    const res = await submit(() => api.post(url, values).catch(async (err) => {
      if (err.status !== 409 && err.status !== 404) throw err;
      await onDone(err.message, true);
      return undefined;
    }));
    if (res) await onDone(`${ticket.worker.name}’s ticket is resolved.`);
  }
  return (
    <Modal title={`Resolve ${ticket.worker.name}’s ticket`} onClose={onClose} busy={busy}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
        <button type="submit" form="resolve-ticket" disabled={busy} className="btn-primary">{busy ? <Spinner size={15} /> : 'Resolve'}</button>
      </>}>
      <form id="resolve-ticket" onSubmit={send} className="space-y-4" noValidate>
        <Alert>{formError}</Alert>
        <p className="text-sm font-body text-ink/65">{ticket.typeLabel}: “{ticket.reason}”</p>
        <Field label="How it was dealt with" error={errors.note} required htmlFor="resolve-note" hint="They will see this too.">
          <textarea id="resolve-note" className="input min-h-[80px]" maxLength={300} value={values.note} onChange={set('note')} />
        </Field>
      </form>
    </Modal>
  );
}
