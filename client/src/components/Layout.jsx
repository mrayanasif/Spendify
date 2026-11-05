import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { Button, Empty } from './ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { initials, relativeTime } from '../lib/format';
import SessionManager from './SessionManager';

/* Route table drives both the sidebar and the breadcrumb labels. */
const STUDENT_NAV = [
  {
    section: 'Track',
    items: [
      { to: '/app', label: 'Dashboard', icon: 'grid', end: true },
      { to: '/app/transactions', label: 'Transactions', icon: 'list' },
      { to: '/app/categories', label: 'Categories', icon: 'tag' },
      { to: '/app/budgets', label: 'Budgets', icon: 'target' }
    ]
  },
  {
    section: 'Understand',
    items: [
      { to: '/app/reports', label: 'Reports', icon: 'chart' },
      { to: '/app/insights', label: 'Monthly Insights', icon: 'book' },
      { to: '/app/tips', label: 'Saving Tips', icon: 'bulb' },
      { to: '/app/bookmarks', label: 'Saved', icon: 'bookmark' }
    ]
  },
  {
    section: 'Account',
    items: [
      { to: '/', label: 'Website', icon: 'home', end: true },
      { to: '/app/import', label: 'Import CSV', icon: 'upload' },
      { to: '/app/profile', label: 'Profile', icon: 'user' },
      { to: '/app/notes', label: 'Notes', icon: 'book' }
    ]
  }
];

const ADMIN_NAV = [
  {
    section: 'Control panel',
    items: [
      { to: '/admin', label: 'Overview', icon: 'grid', end: true },
      { to: '/admin/users', label: 'Students', icon: 'users' },
      { to: '/admin/categories', label: 'Default Categories', icon: 'tag' },
      { to: '/admin/announcements', label: 'Notices & Templates', icon: 'megaphone' },
      { to: '/admin/settings', label: 'System settings', icon: 'sliders' }
    ]
  }
];

const CRUMB_LABELS = {
  app: 'Dashboard',
  admin: 'Control panel',
  transactions: 'Transactions',
  categories: 'Categories',
  budgets: 'Budgets',
  reports: 'Reports',
  insights: 'Monthly Insights',
  tips: 'Saving Tips',
  bookmarks: 'Saved',
  import: 'Import CSV',
  profile: 'Profile',
  notes: 'Notes',
  users: 'Students',
  announcements: 'Notices & Templates',
  settings: 'System settings'
};

/* ---------------------------------------------------------- breadcrumbs */

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);

  const crumbs = parts.map((part, index) => ({
    label: CRUMB_LABELS[part] || part.replace(/-/g, ' '),
    to: `/${parts.slice(0, index + 1).join('/')}`,
    last: index === parts.length - 1
  }));

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link to="/">Home</Link>
      {crumbs.map((crumb) => (
        <span key={crumb.to} className="row gap-1">
          <Icon name="chevronRight" size={13} />
          {crumb.last ? (
            <span className={`current ${crumb.to === '/app' || crumb.to === '/admin' ? 'current-dashboard' : ''}`}>
              {(crumb.to === '/app' || crumb.to === '/admin') && <Icon name="grid" size={15} />}
              {crumb.label}
            </span>
          ) : (
            <Link to={crumb.to}>{crumb.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------ notifications */

function NotificationDrawer({ open, onClose, onCountChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const data = await api.get('/notifications');
      setItems(data.items);
      onCountChange(data.unread);
    } catch {
      /* the bell simply stays as it was */
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      toast.success('All notifications marked as read.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    try {
      await api.del(`/notifications/${id}`);
      toast.success('Notification dismissed.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!open) return null;

  const TONES = { danger: 'alert', warn: 'alert', info: 'info' };

  return (
    <>
      <div className="rail-scrim" onClick={onClose} />
      <aside className="drawer" id="notifications-drawer" aria-label="Notifications">
        <header className="row-between" style={{ padding: '1.1rem 1.1rem 0.9rem', borderBottom: '1px solid var(--line)' }}>
          <h2 className="card-title">Notifications</h2>
          <div className="row gap-1">
            <Button size="sm" onClick={markAll}>Mark all read</Button>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={17} /></button>
          </div>
        </header>

        <div className="grow" style={{ overflowY: 'auto' }}>
          {loading ? (
            <p className="small dim center mt-4">Loading…</p>
          ) : items.length === 0 ? (
            <Empty icon="bell" title="Nothing to report">
              Budget warnings appear here as soon as a category gets close to its limit.
            </Empty>
          ) : (
            items.map((item) => (
              <article key={item._id} className={`notif ${item.read ? '' : 'unread'}`}>
                <span
                  className="notif-mark"
                  style={{
                    background: item.level === 'danger' ? 'var(--expense-soft)' : item.level === 'warn' ? 'var(--warn-soft)' : 'var(--surface-3)',
                    color: item.level === 'danger' ? 'var(--expense)' : item.level === 'warn' ? 'var(--warn)' : 'var(--text-2)'
                  }}
                >
                  <Icon name={TONES[item.level] || 'info'} size={16} />
                </span>
                <div className="grow">
                  <div className="strong small">{item.title}</div>
                  <p className="tiny muted" style={{ marginTop: 2 }}>{item.body}</p>
                  <span className="tiny dim">{relativeTime(item.createdAt)}</span>
                </div>
                <button className="icon-btn" onClick={() => remove(item._id)} aria-label="Remove">
                  <Icon name="x" size={14} />
                </button>
              </article>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

/* ----------------------------------------------------------- app shell */

export default function Layout({ variant = 'student' }) {
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggleTheme, scale, cycleScale } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [railOpen, setRailOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [unread, setUnread] = useState(0);

  const nav = variant === 'admin' ? ADMIN_NAV : STUDENT_NAV;

  /* Close the mobile drawer whenever the route changes. */
  useEffect(() => setRailOpen(false), [pathname]);

  /* Poll the unread count for the bell badge (students only). */
  useEffect(() => {
    if (variant !== 'student') return undefined;

    let alive = true;
    const check = async () => {
      try {
        const data = await api.get('/notifications');
        if (alive) setUnread(data.unread);
      } catch {
        /* ignore */
      }
    };

    check();
    const id = setInterval(check, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [variant]);

  const signOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="shell" data-rail={collapsed ? 'collapsed' : 'full'} data-theme={theme}>
      <SessionManager loginPath="/login" />
      {railOpen && <div className="rail-scrim" onClick={() => setRailOpen(false)} />}

      <aside className={`rail ${railOpen ? 'open' : ''}`}>
        <Link to={variant === 'admin' ? '/admin' : '/app'} className="rail-brand">
          <span className="rail-mark" aria-hidden="true">
            <span className="brand-mark">S</span>
          </span>
          <span>
            <span className="rail-name">Spendify</span>
            <span className="rail-tag">{variant === 'admin' ? 'Control panel' : 'Student'}</span>
          </span>
        </Link>

        <nav className="grow stack gap-1" style={{ overflowY: 'auto' }}>
          {nav.map((group) => (
            <div key={group.section}>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="rail-foot stack gap-2">
          <button
            className="rail-user"
            onClick={() => navigate(variant === 'admin' ? '/admin' : '/app/profile')}
            title={`${user?.name || ''} - ${isAdmin ? 'Administrator' : 'Student'}`}
          >
            <span className="rail-avatar">{initials(user?.name)}</span>
            <span className="rail-user-text">
              <span className="rail-user-name">{user?.name}</span>
              <span className="rail-user-role">{isAdmin ? 'Administrator' : 'Student'}</span>
            </span>
          </button>
          <button className="rail-link" onClick={signOut}>
            <Icon name="logout" size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button
            className="icon-btn topbar-menu-button hide-print"
            onClick={() => (window.innerWidth <= 900 ? setRailOpen((v) => !v) : setCollapsed((v) => !v))}
            aria-label={railOpen ? 'Close navigation' : 'Open navigation'}
            title={railOpen ? 'Close navigation' : 'Open navigation'}
          >
            <Icon name={railOpen ? 'x' : 'menu'} size={19} />
          </button>

          <Breadcrumbs />

          <div className="grow" />

          <div className="row gap-2 hide-print topbar-actions">
            <button
              className="icon-btn topbar-control"
              onClick={cycleScale}
              title={`Text size: ${Math.round(scale * 100)}%`}
              aria-label="Change text size"
            >
              <Icon name="type" size={18} />
            </button>

            <button
              className="icon-btn topbar-control"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle dark mode"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>

            {variant === 'student' && (
              <button
                className="icon-btn topbar-notification"
                onClick={() => setDrawer(true)}
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                aria-expanded={drawer}
                aria-controls="notifications-drawer"
              >
                <Icon name="bell" size={18} />
                <span className="topbar-notification-label">Notifications</span>
                {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
              </button>
            )}
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>

      <NotificationDrawer open={drawer} onClose={() => setDrawer(false)} onCountChange={setUnread} />
    </div>
  );
}
