import { useEffect, useState } from 'react';
import { Gift, CheckCircle2 } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Alert, Empty, PageHeader, Spinner } from '../components/ui';
import { TicketSummary } from '../components/tickets';
import { api } from '../lib/api';
import { formatDate, formatDay } from '../lib/format';

/** A worker's own record: rewards they're working towards or have earned, and any tickets. */
export default function Record() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/record').then(setData).catch((err) => setError(err.message));
  }, []);

  return (
    <AppShell title="My record">
      <PageHeader title="My record" subtitle="Rewards for coming faithfully, and any tickets you’ve been given." />
      <Alert>{error}</Alert>
      {!data ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="section-label mb-3">Rewards</h2>
            {data.rewards.length === 0 ? <Empty>No rewards are running just now.</Empty> : (
              <ul className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                {data.rewards.map((r) => <RewardCard key={r.id} reward={r} />)}
              </ul>
            )}
          </section>
          <section>
            <h2 className="section-label mb-3">Tickets</h2>
            {data.tickets.length === 0 ? <Empty>No tickets — well done.</Empty> : (
              <ul className="space-y-3">
                {data.tickets.map((t) => <li key={t.id} className="card p-4 sm:p-5"><TicketSummary ticket={t} /></li>)}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function RewardCard({ reward: r }) {
  const share = Math.min(100, Math.round((r.progress / r.target) * 100));
  const counts = r.service ? r.service.name : 'services';
  return (
    <li className={`card p-4 sm:p-5 ${r.earned ? 'border-l-4 border-l-gold' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${r.earned ? 'bg-gold/15 text-gold' : 'bg-purple-brand/8 text-purple-brand'}`}>
          <Gift size={18} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-xl text-ink leading-tight">{r.name}</h3>
          {r.description && <p className="text-sm font-body text-ink/60 mt-0.5">{r.description}</p>}
          <p className="text-xs font-body text-ink/45 mt-1">
            {r.target} × {counts}{r.onTimeOnly && ', on time'} · {formatDay(r.startsOn, { short: true })} – {formatDay(r.endsOn, { short: true })}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-sm font-body mb-1.5">
          <span className="text-ink/70"><strong className="text-ink">{Math.min(r.progress, r.target)}</strong> of {r.target}</span>
          {r.handedOver ? (
            <span className="text-green-700 inline-flex items-center gap-1"><CheckCircle2 size={14} /> Received {formatDate(r.handedOver.handedOverAt)}</span>
          ) : r.earned ? (
            <span className="text-[#8a6d1f] font-medium">Earned — collect it from the church office</span>
          ) : r.state === 'ended' ? (
            <span className="text-ink/45">Ended</span>
          ) : null}
        </div>
        <div className="h-2 rounded-full bg-purple-brand/8 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={r.target} aria-valuenow={Math.min(r.progress, r.target)}>
          <div className={`h-full rounded-full ${r.earned ? 'bg-gold' : 'bg-purple-brand'}`} style={{ width: `${share}%` }} />
        </div>
      </div>
    </li>
  );
}
