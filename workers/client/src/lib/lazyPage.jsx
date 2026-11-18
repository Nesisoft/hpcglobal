import { lazy } from 'react';

const KEY = 'hpc_workers_reloaded';
const read = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* private mode */ } };

function LoadFailed() {
  return (
    <div className="min-h-screen bg-mist flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-body text-ink/70">This page couldn’t be loaded. Check your connection and try again.</p>
      <button className="btn-primary" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
}

/**
 * A page loaded when first opened. After a new release the files an open
 * app asks for are gone, so it reloads once to get the new version; if the
 * page still can't be fetched (offline), it says so rather than going blank.
 */
export const lazyPage = (load) => lazy(() => load().then(
  (module) => { write(null); return module; },
  () => {
    if (!read() && navigator.onLine) {
      write('1');
      window.location.reload();
      return new Promise(() => {});
    }
    return { default: LoadFailed };
  },
));
