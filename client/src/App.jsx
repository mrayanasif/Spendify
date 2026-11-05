import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';

import Layout from './components/Layout';
import { LoadingBar, Empty, Button } from './components/ui';
import Icon from './components/Icon';

import Landing from './pages/Landing';
import { Login, Register, ForgotPassword, ResetPassword } from './pages/Auth';

/* Heavier screens load on demand so the first paint stays quick. */
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Categories = lazy(() => import('./pages/Categories'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Reports = lazy(() => import('./pages/Reports'));
const Insights = lazy(() => import('./pages/Insights'));
const Tips = lazy(() => import('./pages/Tips'));
const Bookmarks = lazy(() => import('./pages/Bookmarks'));
const ImportCsv = lazy(() => import('./pages/ImportCsv'));
const Profile = lazy(() => import('./pages/Profile'));
const Notes = lazy(() => import('./pages/Notes'));

const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

/* ------------------------------------------------------------- guards */

function FullPageLoader() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <div className="stack gap-2 center">
        <span className="spinner" style={{ width: 26, height: 26, color: 'var(--honey)', margin: '0 auto' }} />
        <span className="small dim">Loading…</span>
      </div>
    </div>
  );
}

/** Blocks a route until the session is known, then sends the wrong role away. */
function Protected({ role, children }) {
  const { ready, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!ready) return <FullPageLoader />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (role && user.role !== role) {
    // A signed-in admin landing on a student URL (or the reverse) goes to their own home.
    return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />;
  }

  return children;
}

/** Sends an already signed-in visitor away from the sign-in pages. */
function PublicOnly({ children }) {
  const { ready, isAuthenticated, user } = useAuth();
  if (!ready) return <FullPageLoader />;
  if (isAuthenticated) return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />;
  return children;
}

function NotFound() {
  return (
    <div className="public" style={{ justifyContent: 'center' }}>
      <div className="section">
        <div className="section-inner center">
          <div className="empty-mark" style={{ width: 70, height: 70, margin: '0 auto 1.2rem' }}>
            <Icon name="search" size={28} />
          </div>
          <h1 style={{ fontSize: '2rem' }}>Page not found</h1>
          <p className="muted mt-2">That address does not match anything in Spendify.</p>
          <div className="row gap-2 mt-4" style={{ justifyContent: 'center' }}>
            <Link to="/"><Button variant="primary" icon="left">Back to home</Button></Link>
            <Link to="/app"><Button>Go to dashboard</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- routes */

function AppRoutes() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        {/* public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* student */}
        <Route
          path="/app"
          element={<Protected role="student"><Layout variant="student" /></Protected>}
        >
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="categories" element={<Categories />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="reports" element={<Reports />} />
          <Route path="insights" element={<Insights />} />
          <Route path="tips" element={<Tips />} />
          <Route path="bookmarks" element={<Bookmarks />} />
          <Route path="import" element={<ImportCsv />} />
          <Route path="profile" element={<Profile />} />
          <Route path="notes" element={<Notes />} />
        </Route>

        {/* administrator */}
        <Route
          path="/admin"
          element={<Protected role="admin"><Layout variant="admin" /></Protected>}
        >
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
