import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, WifiOff } from 'lucide-react';
import AuthScreen from '../components/AuthScreen';
import { Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';

/**
 * Shown when a sign-in is saved on this phone but the server couldn't be
 * asked about it as the app opened. They are still signed in, so rather than
 * the sign-in screen this says what is wrong and tries again — with the
 * button, when the connection comes back, and whenever the app is brought
 * back to the front.
 */
export default function Unreachable() {
  const { unreachable, refresh, logout } = useAuth();
  const [trying, setTrying] = useState(false);
  const inFlight = useRef(false);

  const retry = useCallback(async () => {
    if (inFlight.current) return;   // 'online' and 'focus' often come together
    inFlight.current = true;
    setTrying(true);
    try { await refresh(); } finally { inFlight.current = false; setTrying(false); }
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') retry(); };
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [retry]);

  const noConnection = !unreachable || unreachable.status === 0;
  return (
    <AuthScreen
      title="Can’t reach HPC Workers"
      subtitle={noConnection ? 'Check your connection.' : 'The server isn’t answering just now.'}
    >
      <div className="text-center space-y-4" aria-live="polite">
        <div className="w-14 h-14 mx-auto rounded-full bg-gold/15 ring-1 ring-gold/30 flex items-center justify-center">
          <WifiOff size={24} className="text-gold" />
        </div>
        <p className="text-white/70 font-body text-sm leading-relaxed">
          You’re still signed in.{' '}
          {noConnection
            ? 'The app opens by itself once you’re back online, or try again now.'
            : 'Please try again in a moment.'}
        </p>
        <button type="button" onClick={retry} disabled={trying} className="btn-primary w-full">
          {trying ? <><Spinner size={15} /> Trying…</> : <><RotateCcw size={15} /> Try again</>}
        </button>
        <div className="pt-1">
          <button type="button" onClick={logout} className="text-white/40 hover:text-white/70 text-xs font-body">Sign out</button>
        </div>
      </div>
    </AuthScreen>
  );
}
