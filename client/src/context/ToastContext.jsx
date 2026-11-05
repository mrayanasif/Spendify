import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';

const ToastContext = createContext(null);

const ICONS = { success: 'check', error: 'alert', warn: 'alert', info: 'info' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'info', duration = 4000) => {
      const text = typeof message === 'string' ? message : (message?.message || String(message || ''));
      if (!text) return null;
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, message: text, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error', 6000),
      warn: (m) => push(m, 'warn', 5000),
      info: (m) => push(m, 'info')
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast"
            data-tone={t.tone}
            role={t.tone === 'error' ? 'alert' : 'status'}
            aria-live={t.tone === 'error' ? 'assertive' : 'polite'}
          >
            <Icon name={ICONS[t.tone] || 'info'} size={17} />
            <span className="grow">{t.message}</span>
            <button className="btn-quiet" style={{ padding: 0, color: 'inherit' }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="x" size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
