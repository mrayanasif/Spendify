import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, SESSION_EXPIRED } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  /* Restore the session on first load. */
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const { user: me } = await api.get('/auth/me', undefined, { suppressSessionExpired: true });
        if (!cancelled) setUser(me);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password, expect = null) => {
    const payload = { email, password };
    if (expect) payload.expect = expect;
    const data = await api.post('/auth/login', payload);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback((reason = 'manual') => {
    if (reason !== 'account_deleted') api.post('/auth/logout').catch(() => {});
    setToken(null);
    setUser(null);
    try {
      localStorage.setItem('campuscoin:session_logout', JSON.stringify({ at: Date.now(), reason }));
    } catch {
      /* the local session still ends when storage is unavailable */
    }
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== 'campuscoin:session_logout' || !event.newValue) return;
      setToken(null);
      setUser(null);
      let reason = 'multi_tab_logout';
      try {
        if (JSON.parse(event.newValue).reason === 'session_expired') reason = 'session_expired';
      } catch {
        /* malformed storage data still ends the local session */
      }
      navigate(`/login?reason=${reason}`, { replace: true });
    };
    const onExpired = () => {
      setToken(null);
      setUser(null);
      navigate('/login?reason=session_expired', { replace: true });
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SESSION_EXPIRED, onExpired);
    };
  }, [navigate]);

  /** Merges a fresh user object returned by a profile or preferences save. */
  const patchUser = useCallback((next) => {
    setUser((current) => (current ? { ...current, ...next } : next));
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      currency: user?.preferences?.currency || 'USD',
      login,
      register,
      logout,
      patchUser
    }),
    [user, ready, login, register, logout, patchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
