import { createContext, useContext, useState, useCallback } from 'react';
import { adminApi } from '../services/api';
import { saveTokens, clearTokens, getAccessToken, decodeToken, isTokenExpired } from '../utils/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const token = getAccessToken();
    if (!token || isTokenExpired(token)) return null;
    return decodeToken(token);
  });

  const login = useCallback(async (email, password) => {
    const { data } = await adminApi.login({ email, password });
    saveTokens(data);
    const signedIn = decodeToken(data.accessToken);
    setUser(signedIn);
    // Returned so the caller can route by role — state set here is not yet
    // readable in the same tick.
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try { await adminApi.logout(); } catch { /* ignore */ }
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
