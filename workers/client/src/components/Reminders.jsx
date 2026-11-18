import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { Alert, Spinner } from './ui';
import { reminderState, turnOn, turnOff } from '../lib/push';

const NUDGE_SNOOZE = 'hpc_workers_reminder_nudge_snoozed';
const nudgeSnoozed = () => {
  try { return Date.now() - Date.parse(localStorage.getItem(NUDGE_SNOOZE) || '') < 30 * 864e5; } catch { return false; }
};
const snoozeNudge = () => { try { localStorage.setItem(NUDGE_SNOOZE, new Date().toISOString()); } catch { /* private mode */ } };

function useReminders() {
  const [status, setStatus] = useState(null);   // { state, publicKey }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    reminderState().then((s) => { if (live) setStatus(s); }).catch(() => { if (live) setStatus({ state: 'unsupported' }); });
    return () => { live = false; };
  }, []);
  async function change(on) {
    setBusy(true); setError('');
    try {
      const state = on ? await turnOn(status.publicKey) : await turnOff();
      setStatus((s) => ({ ...s, state }));
    } catch {
      setError('That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return { status, busy, error, change };
}

/** On the Profile page: clock-out reminders for this phone, on or off. */
export function ReminderSettings() {
  const { status, busy, error, change } = useReminders();
  if (!status || status.state === 'unsupported') return null;
  const on = status.state === 'on';
  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center gap-2.5">
        {on ? <BellRing size={18} className="text-gold" aria-hidden="true" /> : <BellOff size={18} className="text-ink/40" aria-hidden="true" />}
        <h2 className="font-display text-xl text-ink">Clock-out reminders</h2>
      </div>
      <p className="text-sm font-body text-ink/60">
        A notification on this phone when a service you’re clocked in to ends, so you clock out before you leave church.
      </p>
      <Alert>{error}</Alert>
      {status.state === 'install' && (
        <p className="text-sm font-body text-ink/70">On an iPhone, install the app on your home screen first (see “Install the app”), then turn reminders on from there.</p>
      )}
      {status.state === 'blocked' && (
        <p className="text-sm font-body text-ink/70">Notifications are blocked for this app. Allow them in your phone’s settings (or the browser’s site settings), then come back here.</p>
      )}
      {(status.state === 'on' || status.state === 'off') && (
        <button onClick={() => change(!on)} disabled={busy} className={on ? 'btn-outline w-full sm:w-auto' : 'btn-primary w-full sm:w-auto'}>
          {busy ? <Spinner size={15} /> : on ? <BellOff size={15} /> : <BellRing size={15} />} {on ? 'Turn reminders off' : 'Turn reminders on'}
        </button>
      )}
    </section>
  );
}

/** Just after clocking in: an offer to be reminded, if reminders are off here. */
export function ReminderNudge() {
  const { status, busy, error, change } = useReminders();
  const [hidden, setHidden] = useState(nudgeSnoozed);
  const [asked, setAsked] = useState(false);
  if (asked && status?.state === 'on') return <Alert kind="success">Reminders are on. You’ll get one on this phone when the service ends.</Alert>;
  if (hidden || !status || status.state !== 'off' || Notification.permission === 'denied') return null;
  return (
    <div className="rounded-lg border border-gold/30 bg-gold/10 p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
      <p className="flex-1 text-sm font-body text-ink/75 flex items-start gap-2">
        <BellRing size={16} className="text-gold flex-shrink-0 mt-0.5" aria-hidden="true" />
        Want a reminder on this phone when the service ends, so you don’t forget to clock out?
      </p>
      <Alert>{error}</Alert>
      <div className="flex gap-2">
        <button onClick={() => { snoozeNudge(); setHidden(true); }} disabled={busy} className="btn-outline px-3 py-2 text-xs flex-1 sm:flex-none">No thanks</button>
        <button onClick={() => { setAsked(true); change(true); }} disabled={busy} className="btn-primary px-3 py-2 text-xs flex-1 sm:flex-none">
          {busy ? <Spinner size={13} /> : <BellRing size={13} />} Remind me
        </button>
      </div>
    </div>
  );
}
