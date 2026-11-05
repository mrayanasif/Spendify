import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

/**
 * Theme and font size.
 * Stored locally so the choice applies instantly and survives a signed-out
 * reload, and mirrored to the account so it follows the student to another
 * device. Local storage wins on load; the server copy fills in on sign-in.
 */

const ThemeContext = createContext(null);

const THEME_KEY = 'campuscoin.theme';
const SCALE_KEY = 'campuscoin.scale';

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore — preference just will not persist */
  }
};

export function ThemeProvider({ children }) {
  const { user, patchUser, isAuthenticated } = useAuth();

  const [theme, setThemeState] = useState(() => {
    const stored = read(THEME_KEY, null);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [scale, setScaleState] = useState(() => Number(read(SCALE_KEY, '1')) || 1);

  /* Adopt the account's saved preferences once the session is known. */
  useEffect(() => {
    if (!user?.preferences) return;
    if (!read(THEME_KEY, null) && user.preferences.theme) setThemeState(user.preferences.theme);
    if (!read(SCALE_KEY, null) && user.preferences.fontScale) setScaleState(user.preferences.fontScale);
  }, [user]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--scale', String(scale));
  }, [theme, scale]);

  const persist = useCallback(
    async (patch) => {
      if (!isAuthenticated) return;
      try {
        const { user: updated } = await api.put('/profile/preferences', patch);
        patchUser(updated);
      } catch {
        /* a failed sync is not worth interrupting the student for */
      }
    },
    [isAuthenticated, patchUser]
  );

  const setTheme = useCallback(
    (next) => {
      setThemeState(next);
      write(THEME_KEY, next);
      persist({ theme: next });
    },
    [persist]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const setScale = useCallback(
    (next) => {
      const clamped = Math.min(1.3, Math.max(0.9, Number(next) || 1));
      setScaleState(clamped);
      write(SCALE_KEY, String(clamped));
      persist({ fontScale: clamped });
    },
    [persist]
  );

  /** Steps through the three offered sizes. */
  const cycleScale = useCallback(() => {
    const steps = [1, 1.1, 1.2];
    const index = steps.findIndex((s) => Math.abs(s - scale) < 0.01);
    setScale(steps[(index + 1) % steps.length]);
  }, [scale, setScale]);

  const increaseScale = useCallback(() => {
    setScale(Math.min(1.3, Math.round((scale + 0.1) * 10) / 10));
  }, [scale, setScale]);

  const decreaseScale = useCallback(() => {
    setScale(Math.max(0.9, Math.round((scale - 0.1) * 10) / 10));
  }, [scale, setScale]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      scale,
      setScale,
      cycleScale,
      increaseScale,
      decreaseScale,
      isDark: theme === 'dark'
    }),
    [theme, setTheme, toggleTheme, scale, setScale, cycleScale, increaseScale, decreaseScale]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
