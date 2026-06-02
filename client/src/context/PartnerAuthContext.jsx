import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const KEY = 'hpc_partner_token';

const PartnerAuthContext = createContext(null);

export function PartnerAuthProvider({ children }) {
  const [partner, setPartner]         = useState(null);
  const [isAuthenticated, setIsAuth]  = useState(false);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(KEY);
    if (token) {
      api.get('/partner/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(({ data }) => { setPartner(data); setIsAuth(true); })
        .catch(() => { localStorage.removeItem(KEY); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/partner/login', { email, password });
    localStorage.setItem(KEY, data.token);
    setPartner(data.partner);
    setIsAuth(true);
    return data;
  }

  function logout() {
    localStorage.removeItem(KEY);
    setPartner(null);
    setIsAuth(false);
  }

  function getToken() { return localStorage.getItem(KEY); }

  return (
    <PartnerAuthContext.Provider value={{ partner, isAuthenticated, loading, login, logout, getToken }}>
      {children}
    </PartnerAuthContext.Provider>
  );
}

export function usePartnerAuth() {
  return useContext(PartnerAuthContext);
}
