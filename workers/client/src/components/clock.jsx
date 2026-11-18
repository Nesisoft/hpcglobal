import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, Keyboard } from 'lucide-react';
import { Field, Modal } from './ui';
import { attendanceStatusLabel, METHOD_LABEL } from '../lib/format';

/**
 * The bits of clocking in that several screens share: the status of a
 * record, how it was made, where a session is in its day, and typing the
 * code shown under the QR at church.
 */

const STATUS_TONE = {
  ON_TIME:   'bg-green-50 text-green-700 border-green-200',
  LATE:      'bg-gold/15 text-[#8a6d1f] border-gold/30',
  VERY_LATE: 'bg-red-50 text-red-700 border-red-200',
};

/** "On time" in green, "18 min late" in gold, "Very late" in red. */
export function AttendanceBadge({ attendance }) {
  if (!attendance) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-body font-medium whitespace-nowrap ${STATUS_TONE[attendance.status] ?? ''}`}>
      {attendanceStatusLabel(attendance)}
    </span>
  );
}

/** GPS, QR code or Manual, quietly. */
export function MethodTag({ method }) {
  if (!method) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-ink/10 text-[10px] font-body font-semibold uppercase tracking-wider text-ink/45 whitespace-nowrap">
      {METHOD_LABEL[method] ?? method}
    </span>
  );
}

const PHASE = {
  upcoming: { label: 'Later today', tone: 'bg-ink/5 text-ink/55 border-ink/10' },
  open:     { label: 'Clock-in open', tone: 'bg-gold/15 text-[#8a6d1f] border-gold/30' },
  running:  { label: 'On now', tone: 'bg-green-50 text-green-700 border-green-200' },
  finished: { label: 'Finished', tone: 'bg-ink/5 text-ink/45 border-ink/10' },
};

/** Where a session is in its day; `cancelled` wins. */
export function PhaseChip({ phase, cancelled = false, label }) {
  const p = cancelled ? { label: 'Cancelled', tone: 'bg-red-50 text-red-700 border-red-200' } : PHASE[phase];
  if (!p) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-body font-medium whitespace-nowrap ${p.tone}`}>
      {label ?? p.label}
    </span>
  );
}

/**
 * Where a session is now, worked out on the phone from the session's own
 * window and the server's clock — so the Clock in button appears the moment
 * clock-in opens, without waiting for the next refresh. Same rules as the
 * server's `phase`.
 */
export function phaseAt(session, now) {
  const opens = Date.parse(session.window.opensAt);
  const starts = Date.parse(session.startsAt);
  const closes = Date.parse(session.window.closesAt ?? session.endsAt);
  if (now < opens) return 'upcoming';
  if (now < starts) return 'open';
  if (now < closes) return 'running';
  return 'finished';
}

/** The time now, ticking every `everyMs`, so countdowns and phases move on by themselves. */
export function useNow(everyMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** For when GPS can't be used: the QR code at church does the same job. */
export function QrHint({ onType, children }) {
  return (
    <div className="rounded-lg border border-purple-brand/10 bg-mist p-4 flex gap-3">
      <QrCode size={20} className="text-purple-brand flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-sm font-body text-ink/70 space-y-2">
        <p>
          <strong className="text-ink font-semibold">Scan the QR code at church instead.</strong>{' '}
          {children ?? 'Point your phone’s camera at the code on the screen, or type the 6 digits shown under it.'}
        </p>
        <button type="button" onClick={onType} className="inline-flex items-center gap-1.5 text-purple-brand font-medium hover:underline">
          <Keyboard size={14} aria-hidden="true" /> Type the code
        </button>
      </div>
    </div>
  );
}

/** Type the six digits under the QR; the scan page does the rest. */
export function CodeDialog({ onClose }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function go(e) {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError('The code is 6 numbers, shown under the QR code.'); return; }
    navigate(`/q/${code}`);
  }

  return (
    <Modal title="Type the code" onClose={onClose}
      footer={<>
        <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={go}>Continue</button>
      </>}>
      <form onSubmit={go} className="space-y-4" noValidate>
        <p className="text-sm font-body text-ink/65">The 6 numbers under the QR code on the screen at church. They change every 30 seconds, so type the ones showing now.</p>
        <Field label="Code" error={error}>
          <input className="input text-center text-2xl tracking-[0.4em] font-semibold" inputMode="numeric" autoComplete="off"
            maxLength={6} value={code} autoFocus placeholder="••••••"
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} />
        </Field>
      </form>
    </Modal>
  );
}
