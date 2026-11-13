import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, clearToken, getToken, onAccountProblem, setToken } from './api';

/**
 * Who is signed in. The worker record comes from the server (GET /me) rather
 * than from decoding the token, because status, role and HOD flag can change
 * at any time — an approval, a suspension — and the screens follow the server.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [worker, setWorker] = useState(null);
  const [ready, setReady]   = useState(false);
  // A sign-in is saved but the server couldn't be asked about it — no
  // connection, or the server down for a moment. That isn't being signed
  // out, so the app says so and tries again instead of showing the sign-in
  // screen. Holds the ApiError, or null.
  const [unreachable, setUnreachable] = useState(null);
  // Goes up with every sign-in and sign-out, so a GET /me that comes back
  // after one of them is ignored rather than undoing it.
  const session = useRef(0);

  const refresh = useCallback(async () => {
    const asked = session.current;
    if (!getToken()) { setWorker(null); setUnreachable(null); return null; }
    try {
      const { worker: me } = await api.get('/me');
      if (asked !== session.current) return null;
      setWorker(me);
      setUnreachable(null);
      return me;
    } catch (err) {
      if (asked !== session.current) return null;
      // Only the server saying so signs someone out.
      if (err.status === 401) { clearToken(); setWorker(null); setUnreachable(null); }
      else setUnreachable(err);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const logout = useCallback(() => {
    session.current += 1;
    clearToken();
    setWorker(null);
    setUnreachable(null);
  }, []);

  // Any request that finds the account signed out, waiting or shut out
  // updates the picture, and the router shows the matching screen.
  useEffect(() => onAccountProblem((err) => {
    // Signed out — including a temporary password that expired unreplaced.
    if (err.code === 'SIGNED_OUT' || err.code === 'TEMP_PASSWORD_EXPIRED') { logout(); return; }
    refresh();
  }), [refresh, logout]);

  /** After sign-in, sign-up, a reset or a password change: the server's answer. */
  const applySession = useCallback(({ token, worker: me }) => {
    session.current += 1;
    if (token) setToken(token);
    if (me) { setWorker(me); setUnreachable(null); }
    return me;
  }, []);

  const login = useCallback(async (email, password) => (
    applySession(await api.post('/auth/login', { email, password }, { auth: false }))
  ), [applySession]);

  const value = useMemo(() => ({
    worker, ready, unreachable, refresh, login, logout, applySession, setWorker,
    isAdmin: worker?.role === 'ADMIN' || worker?.role === 'SUPER_ADMIN',
    isSuperAdmin: worker?.role === 'SUPER_ADMIN',
    // The server's word: the HOD flag alone isn't enough once their
    // department is archived or their account isn't active.
    isHod: Boolean(worker?.leadsDepartment && worker?.department),
  }), [worker, ready, unreachable, refresh, login, logout, applySession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
