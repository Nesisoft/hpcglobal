import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import api from '../services/api';

const PartnerAuthContext = createContext(null);

export function PartnerAuthProvider({ children }) {
  const [session, setSession]        = useState(null);
  const [partner, setPartner]        = useState(null);
  const [loading, setLoading]        = useState(true);

  const loadProfile = useCallback(async (accessToken) => {
    if (!accessToken) { setPartner(null); return; }
    try {
      const { data } = await api.get('/partner/me', { headers: { Authorization: `Bearer ${accessToken}` } });
      setPartner(data);
    } catch {
      setPartner(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.access_token);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      await loadProfile(newSession?.access_token);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password });
    if (error) throw error;
    setSession(data.session);
    await loadProfile(data.session?.access_token);
    return data;
  }

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setPartner(null);
  }

  function getToken() { return session?.access_token ?? null; }

  // Allow the portal to refresh the profile after the commitment is set
  async function refreshProfile() { await loadProfile(session?.access_token); }

  return (
    <PartnerAuthContext.Provider
      value={{
        partner,
        session,
        isAuthenticated: !!session && !!partner,
        loading,
        login,
        logout,
        getToken,
        refreshProfile,
      }}
    >
      {children}
    </PartnerAuthContext.Provider>
  );
}

export function usePartnerAuth() {
  return useContext(PartnerAuthContext);
}
