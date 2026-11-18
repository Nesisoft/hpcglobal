import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * The number of new notices, shared by the sidebar and Home. Asked for at
 * most once a minute, however many pages are opened; reading the notices
 * sets it straight away.
 */
let state = { unread: 0, latest: null, at: 0, worker: null };
const listeners = new Set();
let pending = null;

function publish(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

export function setUnread(unread, latest = null) {
  publish({ unread, latest, at: Date.now() });
}

export function useUnreadNotices(workerId) {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    // Someone else signed in on this phone: forget the last person's count.
    if (state.worker !== workerId) publish({ unread: 0, latest: null, at: 0, worker: workerId });
    if (workerId && Date.now() - state.at > 60000 && !pending) {
      pending = api.get('/notices/unread')
        .then((r) => { if (state.worker === workerId) setUnread(r.unread, r.latest); })
        .catch(() => {})
        .finally(() => { pending = null; });
    }
    return () => listeners.delete(setValue);
  }, [workerId]);
  return value;
}
