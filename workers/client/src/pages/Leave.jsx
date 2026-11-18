import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Alert, Empty, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { LEAVE_TYPES, LeaveSummary } from '../components/leave';
import { api } from '../lib/api';
import { useForm } from '../lib/useForm';
import { accraToday, addDays } from '../lib/format';

/** A worker's own leave: ask to be excused, see the answers, withdraw. */
export default function Leave() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [asking, setAsking] = useState(false);
  const [withdrawing, setWithdrawing] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try { setData(await api.get('/leave')); } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <AppShell title="My leave">
      <PageHeader title="My leave" subtitle="Ask to be excused from services — when you’re ill, travelling or have a family emergency.">
        <button onClick={() => { setNotice(''); setAsking(true); }} className="btn-primary">
          <CalendarPlus size={16} /> Ask for leave
        </button>
      </PageHeader>

      <div className="space-y-3 mb-4">
        <Alert>{error}</Alert>
        {notice && <Alert kind="success">{notice}</Alert>}
      </div>

      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.leave.length === 0 ? (
        <Empty>You haven’t asked for leave. Once your head of department approves it, the services on those days won’t count against you.</Empty>
      ) : (
        <ul className="space-y-3">
          {data.leave.map((l) => (
            <li key={l.id} className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <LeaveSummary leave={l} />
              {l.cancellable && (
                <button onClick={() => setWithdrawing(l)} className="btn-outline px-4 py-2 text-sm self-start sm:self-center">
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {asking && data && (
        <AskDialog rules={data.rules} onClose={() => setAsking(false)}
          onDone={async () => { setAsking(false); setNotice('Your request was sent to your head of department.'); await load(); }} />
      )}
      {withdrawing && (
        <WithdrawDialog leave={withdrawing} onClose={() => setWithdrawing(null)}
          onDone={async (message, kind) => {
            setWithdrawing(null);
            await load();
            if (kind === 'error') setError(message); else setNotice(message);
          }} />
      )}
    </AppShell>
  );
}

function AskDialog({ rules, onClose, onDone }) {
  const today = accraToday();
  const { values, set, errors, formError, busy, submit } = useForm({ type: 'SICK', startDate: today, endDate: today, reason: '' });

  async function send(e) {
    e.preventDefault();
    const ok = await submit(() => api.post('/leave', values));
    if (ok) await onDone();
  }
  return (
    <Modal title="Ask for leave" onClose={onClose} busy={busy}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
        <button type="submit" form="ask-leave" disabled={busy} className="btn-primary">{busy ? <Spinner size={15} /> : 'Send request'}</button>
      </>}>
      <form id="ask-leave" onSubmit={send} className="space-y-4" noValidate>
        <Alert>{formError}</Alert>
        <Field label="Kind of leave" error={errors.type} required htmlFor="leave-type">
          <select id="leave-type" className="input" value={values.type} onChange={set('type')}>
            {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day" error={errors.startDate} required htmlFor="leave-start">
            <input id="leave-start" type="date" className="input" value={values.startDate}
              min={addDays(today, -rules.backdateDays)} onChange={set('startDate')} />
          </Field>
          <Field label="Last day" error={errors.endDate} required htmlFor="leave-end">
            <input id="leave-end" type="date" className="input" value={values.endDate}
              min={values.startDate || today} onChange={set('endDate')} />
          </Field>
        </div>
        <Field label="Why" error={errors.reason} required htmlFor="leave-reason"
          hint={`Your head of department sees this. Leave can start up to ${rules.backdateDays} days ago and last up to ${rules.maxSpanDays} days.`}>
          <textarea id="leave-reason" className="input min-h-[90px]" maxLength={500} value={values.reason} onChange={set('reason')} />
        </Field>
      </form>
    </Modal>
  );
}

function WithdrawDialog({ leave, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  async function withdraw() {
    setBusy(true);
    try {
      await api.post(`/leave/${leave.id}/cancel`);
      await onDone('Your request was withdrawn.');
    } catch (err) {
      await onDone(err.message, 'error');
    }
  }
  return (
    <Modal title="Withdraw this request?" onClose={onClose} busy={busy}
      footer={<>
        <button onClick={onClose} disabled={busy} className="btn-outline">Keep it</button>
        <button onClick={withdraw} disabled={busy} className="btn-danger">{busy ? <Spinner size={15} /> : 'Withdraw'}</button>
      </>}>
      <p className="text-sm font-body text-ink/65">
        {leave.status === 'APPROVED'
          ? 'This leave has been approved. If you withdraw it, services on those days will count as usual.'
          : 'Your head of department won’t see it any more.'}
      </p>
    </Modal>
  );
}
