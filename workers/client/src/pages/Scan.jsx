import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, LogOut, QrCode, RotateCcw, TriangleAlert, Keyboard } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Spinner } from '../components/ui';
import { AttendanceBadge, CodeDialog, MethodTag } from '../components/clock';
import { api } from '../lib/api';
import { formatDuration, formatTime } from '../lib/format';

/** Keyed by the code, so typing a fresh code here starts again from scratch. */
export function ScanRoute() {
  const { code } = useParams();
  return <Scan key={code} code={code ?? ''} />;
}

/**
 * Where the QR code at church leads (/q/123456): the phone's camera opens
 * this, and it clocks the worker in — or, if they're already in, offers to
 * clock them out. Signing in first, if needed, comes back here.
 */
function Scan({ code }) {
  const location = useLocation();
  const navigate = useNavigate();
  const valid = /^\d{6}$/.test(code);
  // The answer, once shown, is kept with this page in the browser's history,
  // so reloading the page shows it again instead of clocking a second time.
  const saved = location.state?.scan?.code === code ? location.state.scan.result : null;
  const [state, setState] = useState(() => saved ?? (valid ? { kind: 'sending' } : { kind: 'bad', message: 'That link doesn’t look right — scan the QR code again.' }));
  const [typing, setTyping] = useState(false);

  // One request per scan. In development React runs effects twice; the
  // second run listens to the request the first one sent rather than
  // sending another, which would answer "already clocked in".
  const sent = useRef(null);

  // False once the worker has left this page, so a slow answer to a button
  // press can't pull them back to it. Set in an effect because StrictMode
  // unmounts and remounts once in development.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function send(action) {
    setState({ kind: 'sending', action });
    sent.current = api.post('/clock/qr', action ? { code, action } : { code });
    return sent.current;
  }

  function listen(promise, isLive, action) {
    promise.then((res) => {
      if (!isLive()) return;
      const result = {
        kind: 'done', message: res.message, session: res.session, attendance: res.attendance,
        out: Boolean(res.attendance?.clockOutAt),
      };
      setState(result);
      // Only while this scan is still the page on screen; otherwise the
      // replace would take the worker back to it.
      if (window.location.pathname === location.pathname) {
        navigate(location.pathname, { replace: true, state: { scan: { code, result } } });
      }
    }, (err) => {
      if (!isLive()) return;
      if (err.code === 'ALREADY_IN' && action !== 'out') {
        setState({ kind: 'already', session: err.body?.session, attendance: err.body?.attendance });
      } else if (err.code === 'ALREADY_OUT' && err.body?.attendance) {
        // Nothing went wrong: they were in and out already. Show the record.
        setState({
          kind: 'done', message: err.message, session: err.body.session, attendance: err.body.attendance, out: true, earlier: true,
        });
      } else if (err.code === 'BAD_QR') {
        setState({ kind: 'bad', message: err.message });
      } else {
        setState({ kind: 'error', message: err.message, code: err.code, retry: err.status === 0, action });
      }
    });
  }

  useEffect(() => {
    if (!valid || saved) return undefined;
    let live = true;
    listen(sent.current ?? send(), () => live);
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A button press, not an effect: it runs once.
  function again(action) {
    listen(send(action), () => mounted.current, action);
  }

  return (
    <AppShell title="Clocking in">
      <div className="max-w-md mx-auto">
        <section className="card p-6 sm:p-8 text-center" aria-live="polite">
          <Body state={state} onClockOut={() => again('out')} onRetry={() => again(state.action)} onType={() => setTyping(true)} />
        </section>
        {/* "Done" and "Not now" already lead home. */}
        {state.kind !== 'done' && state.kind !== 'already' && (
          <div className="text-center mt-5">
            <Link to="/" className="btn-ghost">Back to Home</Link>
          </div>
        )}
      </div>
      {typing && <CodeDialog onClose={() => setTyping(false)} />}
    </AppShell>
  );
}

// A heading that says what happened, for the refusals people will meet.
const ERROR_TITLE = {
  NOT_OPEN: 'Not open yet',
  CLOSED: 'Clock-in has closed',
  CANCELLED: 'Service cancelled',
  NOT_IN: 'Not clocked in',
  TOO_MANY_CODES: 'Please wait a while',
};

// The server says CLOSED for clock-in and clock-out alike; the try tells them apart.
const errorTitle = ({ code, action }) => (code === 'CLOSED' && action === 'out'
  ? 'Clock-out has closed'
  : ERROR_TITLE[code] ?? 'That didn’t work');

function Body({ state, onClockOut, onRetry, onType }) {
  if (state.kind === 'sending') {
    return (
      <div className="py-8 flex flex-col items-center gap-4 text-purple-brand" role="status">
        <Spinner size={32} />
        <p className="text-sm font-body text-ink/60">{state.action === 'out' ? 'Clocking you out…' : 'Clocking you in…'}</p>
      </div>
    );
  }

  if (state.kind === 'done') {
    const a = state.attendance;
    return (
      <div className="space-y-4">
        <div className="w-20 h-20 mx-auto rounded-full bg-green-50 ring-4 ring-green-100 flex items-center justify-center">
          <Check size={40} className="text-green-600" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-3xl text-ink font-light">
            {state.earlier ? 'Already clocked out' : state.out ? 'You’re clocked out' : 'You’re clocked in'}
          </h1>
          {state.session?.service?.name && <p className="font-body text-ink/65 mt-1">{state.session.service.name}</p>}
        </div>
        {a && (
          <div className="flex items-center justify-center gap-2 flex-wrap text-sm font-body text-ink/70">
            {state.out && a.autoClockedOut ? (
              <span>In at <strong className="text-ink">{formatTime(a.clockInAt)}</strong> · didn’t clock out</span>
            ) : state.out ? (
              <>
                <span>Out at <strong className="text-ink">{formatTime(a.clockOutAt)}</strong></span>
                {a.minutesPresent !== null && a.minutesPresent !== undefined && <span className="text-ink/50">· {formatDuration(a.minutesPresent)}</span>}
              </>
            ) : (
              <>
                <span>In at <strong className="text-ink">{formatTime(a.clockInAt)}</strong></span>
                <AttendanceBadge attendance={a} />
              </>
            )}
            <MethodTag method={a.method} />
          </div>
        )}
        {state.message && <p className="text-sm font-body text-ink/50">{state.message}</p>}
        <Link to="/" className="btn-primary w-full">Done</Link>
      </div>
    );
  }

  if (state.kind === 'already') {
    const name = state.session?.service?.name ?? 'this service';
    const endsAt = state.session?.endsAt ? Date.parse(state.session.endsAt) : null;
    return (
      <div className="space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-gold/15 ring-1 ring-gold/30 flex items-center justify-center">
          <LogOut size={26} className="text-gold" aria-hidden="true" />
        </div>
        <h1 className="font-display text-3xl text-ink font-light">Clock out now?</h1>
        <p className="text-sm font-body text-ink/65">
          You’re clocked in to <strong className="text-ink">{name}</strong>
          {state.attendance?.clockInAt ? <> since <strong className="text-ink">{formatTime(state.attendance.clockInAt)}</strong></> : null}.
        </p>
        {endsAt && Date.now() < endsAt && (
          <p className="text-xs font-body text-ink/50">It runs until {formatTime(state.session.endsAt)} — clocking out now records that you left early.</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <Link to="/" className="btn-outline flex-1">Not now</Link>
          <button type="button" className="btn-crimson flex-1" onClick={onClockOut}><LogOut size={16} /> Clock out</button>
        </div>
      </div>
    );
  }

  if (state.kind === 'bad') {
    return (
      <div className="space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-gold/15 ring-1 ring-gold/30 flex items-center justify-center">
          <QrCode size={26} className="text-gold" aria-hidden="true" />
        </div>
        <h1 className="font-display text-3xl text-ink font-light">Scan again</h1>
        <p className="text-sm font-body text-ink/65" role="alert">{state.message || 'That code has expired — scan the QR again.'}</p>
        <p className="text-xs font-body text-ink/45">The code on the screen changes every 30 seconds, so a photo of it or an old link won’t work.</p>
        <button type="button" className="btn-outline w-full" onClick={onType}><Keyboard size={15} /> Type the code instead</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="w-16 h-16 mx-auto rounded-full bg-red-50 ring-1 ring-red-100 flex items-center justify-center">
        <TriangleAlert size={26} className="text-red-500" aria-hidden="true" />
      </div>
      <h1 className="font-display text-3xl text-ink font-light">{errorTitle(state)}</h1>
      <p className="text-sm font-body text-ink/65" role="alert">{state.message}</p>
      {state.retry && <button type="button" className="btn-primary w-full" onClick={onRetry}><RotateCcw size={15} /> Try again</button>}
    </div>
  );
}
