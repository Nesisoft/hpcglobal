import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Gift, Pencil, Plus } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Empty, Field, Modal, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useForm } from '../../lib/useForm';
import { accraToday, addDays, formatDate, formatDay } from '../../lib/format';

const STATE = { upcoming: 'Not started', running: 'Running', ended: 'Ended' };

/** Rewards for attendance: define them, see who is close, hand them over. */
export default function Rewards() {
  const [data, setData] = useState(null);
  const [services, setServices] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try { setData(await api.get('/admin/rewards')); } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => {
    load();
    api.get('/admin/services').then((r) => setServices(r.services)).catch(() => setServices([]));
  }, [load]);

  if (open) {
    return (
      <AppShell title="Rewards">
        <button onClick={() => { setOpen(null); load(); }} className="btn-ghost px-0 text-sm mb-3"><ArrowLeft size={15} /> All rewards</button>
        <RewardDetail id={open} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Rewards">
      <PageHeader title="Rewards" subtitle="For example: lunch with the Senior Pastor for ten Sundays this quarter. Progress is counted from attendance.">
        <button onClick={() => { setNotice(''); setEditing({}); }} className="btn-primary" disabled={!services}><Plus size={16} /> New reward</button>
      </PageHeader>
      <div className="space-y-3 mb-4">
        <Alert>{error}</Alert>
        {notice && <Alert kind="success">{notice}</Alert>}
      </div>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : data.rewards.length === 0 ? (
        <Empty>No rewards yet.</Empty>
      ) : (
        <ul className="grid md:grid-cols-2 gap-3 sm:gap-4">
          {data.rewards.map((r) => (
            <li key={r.id} className={`card p-4 sm:p-5 flex gap-3 ${r.active ? '' : 'opacity-60'}`}>
              <div className="w-10 h-10 rounded-full bg-gold/10 text-gold flex items-center justify-center flex-shrink-0"><Gift size={18} /></div>
              <button onClick={() => setOpen(r.id)} className="flex-1 min-w-0 text-left">
                <h2 className="font-display text-xl text-ink leading-tight hover:text-purple-brand">{r.name}</h2>
                <p className="text-sm font-body text-ink/60 mt-0.5">
                  {r.target} × {r.service?.name ?? 'any service that counts'}{r.onTimeOnly && ', on time'}
                </p>
                <p className="text-xs font-body text-ink/45 mt-1">
                  {formatDay(r.startsOn, { short: true })} – {formatDay(r.endsOn, { short: true, year: true })} · {r.active ? STATE[r.state] : 'Switched off'} · {r.handedOver} handed over
                </p>
              </button>
              <button onClick={() => { setNotice(''); setEditing(r); }} className="p-2 h-fit rounded text-ink/40 hover:text-purple-brand hover:bg-purple-brand/5" aria-label={`Edit ${r.name}`}>
                <Pencil size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <RewardDialog reward={editing.id ? editing : null} services={services ?? []} onClose={() => setEditing(null)}
          onDone={async () => { setNotice(editing.id ? 'Reward saved.' : 'Reward added. Workers see it under My record.'); setEditing(null); await load(); }} />
      )}
    </AppShell>
  );
}

function RewardDialog({ reward, services, onClose, onDone }) {
  const today = accraToday();
  const { values, set, errors, formError, busy, submit } = useForm({
    name:        reward?.name ?? '',
    description: reward?.description ?? '',
    serviceId:   reward?.service?.id ?? '',
    target:      String(reward?.target ?? 10),
    onTimeOnly:  reward?.onTimeOnly ?? false,
    startsOn:    reward?.startsOn ?? today,
    endsOn:      reward?.endsOn ?? addDays(today, 90),
    active:      reward?.active ?? true,
  });
  async function send(e) {
    e.preventDefault();
    const body = { ...values, serviceId: values.serviceId || null, description: values.description || null, target: Number(values.target) };
    const res = await submit(() => (reward ? api.patch(`/admin/rewards/${reward.id}`, body) : api.post('/admin/rewards', body)));
    if (res) await onDone();
  }
  return (
    <Modal title={reward ? 'Edit reward' : 'New reward'} onClose={onClose} busy={busy} wide
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Cancel</button>
        <button type="submit" form="reward-form" disabled={busy} className="btn-primary">{busy ? <Spinner size={15} /> : 'Save'}</button>
      </>}>
      <form id="reward-form" onSubmit={send} className="space-y-4" noValidate>
        <Alert>{formError}</Alert>
        <Field label="Reward" error={errors.name} required htmlFor="reward-name" hint="What they get, e.g. “Lunch with the Senior Pastor”.">
          <input id="reward-name" className="input" maxLength={120} value={values.name} onChange={set('name')} />
        </Field>
        <Field label="Details (optional)" error={errors.description} htmlFor="reward-desc">
          <textarea id="reward-desc" className="input min-h-[70px]" maxLength={500} value={values.description} onChange={set('description')} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Counts" error={errors.serviceId} htmlFor="reward-service">
            <select id="reward-service" className="input" value={values.serviceId} onChange={set('serviceId')}>
              <option value="">Any service that counts</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="How many times" error={errors.target} required htmlFor="reward-target">
            <input id="reward-target" type="number" min={1} max={500} className="input" value={values.target} onChange={set('target')} />
          </Field>
          <Field label="From" error={errors.startsOn} required htmlFor="reward-from">
            <input id="reward-from" type="date" className="input" value={values.startsOn} onChange={set('startsOn')} />
          </Field>
          <Field label="To" error={errors.endsOn} required htmlFor="reward-to">
            <input id="reward-to" type="date" className="input" min={values.startsOn} value={values.endsOn} onChange={set('endsOn')} />
          </Field>
        </div>
        <label className="flex items-center gap-2.5 text-sm font-body text-ink/75">
          <input type="checkbox" className="accent-purple-brand w-4 h-4" checked={values.onTimeOnly} onChange={set('onTimeOnly')} />
          Only count arriving on time
        </label>
        {reward && (
          <label className="flex items-center gap-2.5 text-sm font-body text-ink/75">
            <input type="checkbox" className="accent-purple-brand w-4 h-4" checked={values.active} onChange={set('active')} />
            Shown to workers
          </label>
        )}
      </form>
    </Modal>
  );
}

function RewardDetail({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [giving, setGiving] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try { setData(await api.get(`/admin/rewards/${id}`)); } catch (err) { setError(err.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function handOver(row) {
    setGiving(row.worker.id); setError(''); setNotice('');
    try {
      await api.post(`/admin/rewards/${id}/hand-over`, { workerId: row.worker.id });
      setNotice(`Recorded: ${row.worker.name} has received “${data.reward.name}”.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGiving(null);
      await load();
    }
  }

  if (!data) return error ? <Alert>{error}</Alert> : <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>;
  const r = data.reward;
  const earned = data.rows.filter((x) => x.earned);
  return (
    <>
      <PageHeader title={r.name} subtitle={`${r.target} × ${r.service?.name ?? 'any service that counts'}${r.onTimeOnly ? ', on time' : ''} · ${formatDay(r.startsOn, { short: true })} – ${formatDay(r.endsOn, { short: true, year: true })}`} />
      <div className="space-y-3 mb-4">
        <Alert>{error}</Alert>
        {notice && <Alert kind="success">{notice}</Alert>}
      </div>
      <p className="text-sm font-body text-ink/60 mb-3">
        {earned.length} earned · {earned.filter((x) => x.handedOver).length} handed over. Everyone with any progress is listed, closest first.
      </p>
      {data.rows.length === 0 ? <Empty>Nobody has any progress yet.</Empty> : (
        <ul className="card divide-y divide-purple-brand/5">
          {data.rows.map((row) => (
            <li key={row.worker.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-body font-medium text-ink truncate">{row.worker.name}</p>
                <p className="text-xs font-body text-ink/45 truncate">{row.worker.department?.name ?? 'No department'}</p>
              </div>
              <div className="flex items-center gap-3 sm:w-56">
                <div className="flex-1 h-1.5 rounded-full bg-purple-brand/8 overflow-hidden" aria-hidden="true">
                  <div className={`h-full ${row.earned ? 'bg-gold' : 'bg-purple-brand'}`} style={{ width: `${Math.min(100, (row.progress / r.target) * 100)}%` }} />
                </div>
                <span className="text-sm font-body tabular-nums text-ink/70 w-16 text-right">{row.progress} of {r.target}</span>
              </div>
              <div className="sm:w-44 sm:text-right">
                {row.handedOver ? (
                  <span className="text-xs font-body text-green-700">Handed over {formatDate(row.handedOver.handedOverAt)}</span>
                ) : row.earned ? (
                  <button onClick={() => handOver(row)} disabled={Boolean(giving)} className="btn-primary px-3 py-1.5 text-xs">
                    {giving === row.worker.id ? <Spinner size={13} /> : <Gift size={13} />} Mark handed over
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
