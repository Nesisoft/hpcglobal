import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Maximize, Minimize, X, WifiOff, Hourglass, TriangleAlert } from 'lucide-react';
import { LOGO_URL, Spinner } from '../components/ui';
import QrCode from '../components/QrCode';
import { useNow } from '../components/clock';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatTime, formatTimeRange } from '../lib/format';

// A code changes every 30 seconds, and the server still accepts it for about
// a minute after it changes; a little less here, to be safe.
const CODE_LIFE_MS = 30000;
const ACCEPTED_AFTER_CHANGE_MS = 55000;

/**
 * The QR code for a service, full screen on a laptop or a TV at church.
 * Workers point their phone's camera at it, or type the six digits under it.
 * The code changes every 30 seconds, so a photo of it passed round the car
 * park is no use; this screen fetches each new one by itself and keeps the
 * screen awake where the browser allows.
 */
export default function QrDisplay() {
  const { sessionId } = useParams();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const back = location.state?.from ?? (isAdmin ? '/admin/sessions' : '/department');

  const [qr, setQr] = useState(null);           // { code, url, refreshInMs, session, at }
  const [session, setSession] = useState(null); // the last one heard of, for the heading
  const [problem, setProblem] = useState(null); // { kind: 'closed' | 'stop' | 'offline', message }
  const now = useNow(5000);
  const awake = useWakeLock();
  const [fullscreen, toggleFullscreen, canFullscreen] = useFullscreen();

  // Fetch the code, then again when it is about to change — and at least
  // every 25 seconds. A newer request's answer always wins over an older one.
  const requests = useRef(0);
  useEffect(() => {
    let live = true;
    let timer;
    const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(fetchCode, ms); };

    async function fetchCode() {
      const n = ++requests.current;
      try {
        const res = await api.get(`/qr/${sessionId}`);
        if (!live || n !== requests.current) return;
        setQr({ ...res, at: Date.now() });
        if (res.session) setSession(res.session);
        setProblem(null);
        const ms = Number(res.refreshInMs);
        // A moment after the change, so the next answer is the new code.
        schedule(Number.isFinite(ms) ? Math.min(Math.max(ms + 250, 1000), 25000) : 25000);
      } catch (err) {
        if (!live || n !== requests.current) return;
        if (err.status === 409) {
          // Not open yet: keep asking, so the code appears by itself the
          // moment clock-in opens. Finished or cancelled: nothing to wait for.
          const s = err.body?.session;
          setQr(null);
          if (s) setSession(s);
          setProblem({ kind: s?.cancelled || s?.phase === 'finished' ? 'over' : 'closed', message: err.message });
          if (!(s?.cancelled || s?.phase === 'finished')) schedule(20000);
        } else if (err.status === 403 || err.status === 404) {
          setQr(null);
          setProblem({ kind: 'stop', message: err.message });
        } else {
          // No connection or a hiccup: the last code stays up while it is
          // still accepted, and this tries again shortly.
          setProblem({ kind: 'offline', message: err.message });
          schedule(5000);
        }
      }
    }

    fetchCode();
    const onVisible = () => { if (document.visibilityState === 'visible') schedule(0); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      live = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [sessionId]);

  const stale = qr && now > qr.at + (Number(qr.refreshInMs) || 0) + ACCEPTED_AFTER_CHANGE_MS;
  const name = session?.service?.name ?? 'Service';
  const remaining = qr ? Math.max(0, Number(qr.refreshInMs) || 0) : 0;

  return (
    <div className="min-h-screen bg-purple-deep text-white flex flex-col"
      style={{ backgroundImage: 'radial-gradient(circle at 20% 15%, rgba(90,45,175,0.45), transparent 55%), radial-gradient(circle at 85% 90%, rgba(201,168,76,0.10), transparent 45%)' }}>
      <header className="pt-safe flex-shrink-0">
        <div className="h-16 px-5 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src={LOGO_URL} alt="HPC Global" className="h-9 w-auto object-contain" />
            <span className="section-label hidden sm:inline">HPC Workers</span>
          </div>
          <div className="flex items-center gap-5 text-xs font-body">
            {canFullscreen && (
              <button type="button" onClick={toggleFullscreen} className="inline-flex items-center gap-1.5 text-white/35 hover:text-white transition-colors">
                {fullscreen ? <><Minimize size={14} /> Leave full screen</> : <><Maximize size={14} /> Full screen</>}
              </button>
            )}
            <Link to={back} className="inline-flex items-center gap-1.5 text-white/35 hover:text-white transition-colors">
              <X size={14} /> Exit
            </Link>
          </div>
        </div>
      </header>

      {/* Side by side on any landscape screen (a 960×540 TV, a phone on its
          side), stacked on a portrait one; [@media(max-height:500px)] tightens
          the text so a phone on its side never scrolls. */}
      <main className="flex-1 flex flex-col landscape:flex-row items-center justify-center gap-8 lg:gap-14 px-5 sm:px-8 pb-safe-5">
        {qr ? (
          <>
            <div className="relative bg-white rounded-2xl p-3 sm:p-4 shadow-2xl w-[min(52vh,88vw)] landscape:w-[min(74vh,46vw)] flex-shrink-0">
              <QrCode value={qr.url} label={`QR code to clock in to ${name}`} className="w-full h-auto block" />
              {stale && (
                <div className="absolute inset-0 rounded-2xl bg-white/95 flex flex-col items-center justify-center gap-3 text-ink p-6 text-center">
                  <WifiOff size={32} className="text-purple-brand" aria-hidden="true" />
                  <p className="font-body text-lg">Reconnecting…</p>
                  <p className="font-body text-sm text-ink/55">This code has run out. A new one shows as soon as the connection is back.</p>
                </div>
              )}
            </div>
            <div className="text-center landscape:text-left max-w-xl min-w-0">
              {/* The instructions are read from a few metres away on a TV: bigger and brighter there. */}
              <p className="section-label lg:text-lg">Scan with your phone’s camera to clock in</p>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl [@media(max-height:500px)]:text-3xl font-light leading-tight mt-2 break-words">{name}</h1>
              {session && (
                <p className="text-white/60 font-body text-base sm:text-lg lg:text-xl [@media(max-height:500px)]:text-base mt-2 [@media(max-height:500px)]:mt-1">
                  {formatTimeRange(session.startsAt, session.endsAt)}
                  {session.service?.venueName ? ` · ${session.service.venueName}` : ''}
                </p>
              )}
              <p className="text-white/65 font-body text-xs sm:text-sm lg:text-lg uppercase tracking-[0.25em] mt-8 lg:mt-12 [@media(max-height:500px)]:mt-4">Or type this code</p>
              <p className={`font-body font-semibold text-gold tabular-nums tracking-[0.12em] leading-none whitespace-nowrap mt-3 text-6xl sm:text-7xl lg:text-8xl [@media(max-height:500px)]:text-5xl [@media(max-height:500px)]:mt-2 ${stale ? 'opacity-30' : ''}`}
                aria-label={`Code ${qr.code.split('').join(' ')}`}>
                {qr.code.slice(0, 3)}<span className="inline-block w-[0.35em]" />{qr.code.slice(3)}
              </p>
              {/* Shrinks until the code changes; a full code lasts 30 seconds. */}
              <div className="mt-8 [@media(max-height:500px)]:mt-4 h-1.5 w-full max-w-sm mx-auto landscape:mx-0 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                <div className="h-full" style={{ width: `${Math.min(1, remaining / CODE_LIFE_MS) * 100}%` }}>
                  <div key={qr.at} className="qr-countdown h-full bg-gold/70 rounded-full" style={{ animationDuration: `${remaining}ms` }} />
                </div>
              </div>
              <p className="text-white/45 font-body text-xs lg:text-sm mt-3 [@media(max-height:500px)]:mt-2">
                {problem?.kind === 'offline' ? 'Can’t reach the server — trying again…' : 'A new code every 30 seconds.'}
                {awake === 'off' && ' Set this computer not to sleep while the code is showing.'}
              </p>
            </div>
          </>
        ) : problem ? (
          <div className="max-w-lg text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-gold/15 ring-1 ring-gold/30 flex items-center justify-center">
              {problem.kind === 'closed' ? <Hourglass size={26} className="text-gold" aria-hidden="true" />
                : problem.kind === 'offline' ? <WifiOff size={26} className="text-gold" aria-hidden="true" />
                  : <TriangleAlert size={26} className="text-gold" aria-hidden="true" />}
            </div>
            {session && <h1 className="font-display text-4xl font-light">{name}</h1>}
            <p className="text-white/75 font-body text-lg" role="status">{problem.message}</p>
            {problem.kind === 'closed' && (
              <p className="text-white/45 font-body text-sm">
                {session?.window?.opensAt ? `Clock-in opens at ${formatTime(session.window.opensAt)}. ` : ''}
                Leave this screen up — the code appears by itself as soon as clock-in opens.
              </p>
            )}
            {problem.kind === 'offline' && <p className="text-white/45 font-body text-sm">Trying again…</p>}
            <Link to={back} className="btn-outline">Back to the app</Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-gold" role="status">
            <Spinner size={32} />
            <p className="text-white/55 font-body text-sm">Getting the code…</p>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Keep the screen on while the code is up, where the browser allows. The
 * browser lets go whenever the tab is hidden, so it is asked again each time
 * the page comes back. Returns 'on', 'off' (refused or unsupported) or null
 * while asking.
 */
function useWakeLock() {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!('wakeLock' in navigator)) { setState('off'); return undefined; }
    let lock = null;
    let stopped = false;
    let asking = false;
    async function acquire() {
      if (stopped || lock || asking || document.visibilityState !== 'visible') return;
      asking = true;
      try {
        const got = await navigator.wakeLock.request('screen');
        if (stopped) { got.release().catch(() => {}); return; }
        lock = got;
        lock.addEventListener('release', () => { lock = null; });
        setState('on');
      } catch {
        // Battery saver, or the browser said no: the page still works.
        if (!stopped) setState('off');
      } finally {
        asking = false;
      }
    }
    acquire();
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
  return state;
}

/** Full screen for a laptop plugged into the TV, where the browser offers it. */
function useFullscreen() {
  const can = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  const [on, setOn] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      // Leaving the QR screen leaves full screen too, back to the app as it was.
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return [on, toggle, can];
}
