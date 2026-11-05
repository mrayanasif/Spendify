import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Button } from './ui';
import Icon from './Icon';

const DEFAULT_IDLE_MS = 15 * 60 * 1000;
const DEFAULT_WARNING_MS = 60 * 1000;

export default function SessionManager({ loginPath = '/login' }) {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const lastActivityRef = useRef(Date.now());
  const lastHeartbeatRef = useRef(Date.now());
  const [lastActivity, setLastActivity] = useState(lastActivityRef.current);
  const [now, setNow] = useState(Date.now());
  const [idleMs, setIdleMs] = useState(DEFAULT_IDLE_MS);
  const [warningMs, setWarningMs] = useState(DEFAULT_WARNING_MS);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const data = await api.get('/auth/session');
        if (!active) return;
        setIdleMs((Number(data.session?.idleMinutes) || 15) * 60 * 1000);
        setWarningMs((Number(data.session?.warningSeconds) || 60) * 1000);
      } catch {
        /* the server-side expiry remains authoritative */
      }
    };
    refresh();
    window.addEventListener('campuscoin:settings-updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('campuscoin:settings-updated', refresh);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const markActivity = () => {
      const current = Date.now();
      if (current - lastActivityRef.current < 750) return;
      lastActivityRef.current = current;
      setLastActivity(current);
    };
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current - lastActivityRef.current < 60 * 1000 && current - lastHeartbeatRef.current >= 60 * 1000) {
        lastHeartbeatRef.current = current;
        api.post('/auth/heartbeat').catch(() => {});
      }
    }, 1000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, markActivity));
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);

  const warning = isAuthenticated && now - lastActivity >= idleMs;
  const secondsLeft = Math.max(0, Math.ceil((lastActivity + idleMs + warningMs - now) / 1000));

  useEffect(() => {
    if (!warning || secondsLeft > 0) return;
    logout('session_expired');
    navigate(`${loginPath}?reason=session_expired`, { replace: true });
  }, [warning, secondsLeft, logout, navigate, loginPath]);

  const keepAlive = async () => {
    try {
      await api.post('/auth/heartbeat');
      const current = Date.now();
      lastActivityRef.current = current;
      lastHeartbeatRef.current = current;
      setLastActivity(current);
      setNow(current);
    } catch {
      logout('session_expired');
      navigate(`${loginPath}?reason=session_expired`, { replace: true });
    }
  };

  if (!warning) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
        background: 'rgba(17, 24, 39, 0.48)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)'
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-warning-title"
        className="card"
        style={{ width: 'min(100%, 430px)', padding: '1.5rem', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="empty-mark" style={{ margin: '0 auto 1rem', color: 'var(--warn)' }}>
          <Icon name="shield" size={24} />
        </div>
        <h2 id="session-warning-title" className="card-title center">Still there?</h2>
        <p className="small muted center mt-1">
          Your account will sign out in <strong className="tabular" style={{ color: 'var(--text-1)' }}>{secondsLeft}s</strong> to protect your financial information.
        </p>
        <div className="row gap-2 mt-4" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button type="button" variant="primary" icon="check" onClick={keepAlive}>Keep session alive</Button>
          <Button
            type="button"
            variant="outline"
            icon="logout"
            onClick={() => {
              logout();
              navigate(loginPath, { replace: true });
            }}
          >
            Log out now
          </Button>
        </div>
      </section>
    </div>
  );
}