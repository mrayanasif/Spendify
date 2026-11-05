import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Field, Banner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';

/* Shared frame for every auth screen. */
function AuthFrame({ title, subtitle, children, foot, aside, eyebrow, featuredTitle = false }) {
  return (
    <div className="auth-split">
      <div className="auth-side">
        <div className="auth-box">
          <Link to="/" className="brand auth-brand mb-3">
            <span className="brand-mark" aria-hidden="true">S</span>
            <span className="brand-name">Spend<span className="brand-accent">ify</span></span>
          </Link>

          {eyebrow && <span className="auth-eyebrow">{eyebrow}</span>}
          <h1 className={featuredTitle ? 'auth-heading auth-heading-featured' : 'auth-heading'}>{title}</h1>
          {subtitle && <p className="muted mt-1" style={{ fontSize: '0.92rem' }}>{subtitle}</p>}

          <div className="mt-4">{children}</div>

          {foot && <div className="mt-3 small muted center">{foot}</div>}
        </div>
      </div>
      <aside className="auth-aside">{aside}</aside>
    </div>
  );
}

const STUDENT_ASIDE = (
  <div style={{ position: 'relative', zIndex: 1 }}>
    <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.5)' }}>Why students use it</span>
    <p className="quote mt-2">
      “I knew my allowance ran out early every month. I didn't know it was the canteen until I saw
      the breakdown.”
    </p>
    <ul className="stack gap-2 mt-4">
      {[
        'Log an expense in under ten seconds',
        'Categories suggested from your own history',
        'Budget warnings before you overspend, not after',
        'A plain-language summary at the end of each month'
      ].map((line) => (
        <li key={line} className="row gap-2 small" style={{ color: 'rgba(255,255,255,0.8)' }}>
          <Icon name="check" size={15} style={{ color: 'var(--honey)', marginTop: 3 }} />
          {line}
        </li>
      ))}
    </ul>

  </div>
);

const ADMIN_ASIDE = (
  <div style={{ position: 'relative', zIndex: 1 }}>
    <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.5)' }}>Spendify administration</span>
    <p className="quote mt-2">A clear view of the tools and settings that keep your student community running.</p>
    <ul className="stack gap-2 mt-4">
      {[
        'Manage student accounts and access',
        'Maintain shared categories and announcements',
        'Review platform activity and system settings'
      ].map((line) => (
        <li key={line} className="row gap-2 small" style={{ color: 'rgba(255,255,255,0.8)' }}>
          <Icon name="check" size={15} style={{ color: 'var(--honey)', marginTop: 3 }} />
          {line}
        </li>
      ))}
    </ul>
  </div>
);

/* ---------------------------------------------------------------- login */

export function Login() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const signedInUser = await login(email, password);
      const requestedPath = typeof location.state?.from === 'string' ? location.state.from : '';
      if (signedInUser.role === 'admin') {
        toast.success('Signed in to the control panel.');
        navigate(
          requestedPath === '/admin' || (requestedPath.startsWith('/admin/') && requestedPath !== '/admin/login')
            ? requestedPath
            : '/admin'
        );
      } else {
        toast.success('Signed in successfully.');
        navigate(
          requestedPath === '/app' || requestedPath.startsWith('/app/')
            ? requestedPath
            : '/app'
        );
      }
    } catch (err) {
      setError(err.message);
      toast.error(err.message || 'Failed to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Welcome back."
      subtitle="Log in to see your month, your patterns, and your next good move."
      eyebrow="Good to see you"
      featuredTitle
      aside={STUDENT_ASIDE}
      foot={<>New here? <Link to="/register" className="strong" style={{ color: 'var(--honey-deep)' }}>Create an account</Link></>}
    >
      <form onSubmit={submit} className="stack gap-3">
        {searchParams.get('reason') && (
          <Banner tone="warn" icon="shield">
            {searchParams.get('reason') === 'multi_tab_logout'
              ? 'You were signed out because this account logged out in another tab.'
              : 'Your session expired for security. Sign in again to continue.'}
          </Banner>
        )}
        {error && <Banner tone="danger" icon="alert">{error}</Banner>}

        <Field label="Email" required>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.edu"
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Password" required>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              style={{ paddingRight: '2.6rem' }}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                display: 'grid', placeItems: 'center', background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--text-2)', padding: 4
              }}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={17} />
            </button>
          </div>
        </Field>

        <div className="row-between">
          <Link to="/forgot-password" className="small" style={{ color: 'var(--text-2)' }}>Forgot your password?</Link>
        </div>

        <Button type="submit" variant="primary" className="btn-block" loading={busy}>Sign in</Button>
      </form>
    </AuthFrame>
  );
}

/* ------------------------------------------------------------- register */

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '',
    academicYear: '', monthlyAllowance: '', savingsGoal: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter.';
    if (!/[a-z]/.test(pwd)) return 'Password must contain at least one lowercase letter.';
    if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number.';
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return 'Password must contain at least one special character.';
    return null;
  };

  const submit = async (event) => {
    event.preventDefault();
    // Validate name - no numbers
    if (/\d/.test(form.name)) {
      const msg = 'Name cannot contain numbers.';
      setError(msg);
      toast.error(msg);
      return;
    }
    if (form.name.trim().length < 2) {
      const msg = 'Please enter a valid name.';
      setError(msg);
      toast.error(msg);
      return;
    }
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      const msg = 'Please enter a valid email address.';
      setError(msg);
      toast.error(msg);
      return;
    }
    if (form.password !== form.confirm) {
      const msg = 'The two passwords do not match.';
      setError(msg);
      toast.error(msg);
      return;
    }
    const pwdError = validatePassword(form.password);
    if (pwdError) {
      setError(pwdError);
      toast.error(pwdError);
      return;
    }

    // Savings goal cannot exceed what comes in each month.
    const allowance = Number(form.monthlyAllowance) || 0;
    const goal = Number(form.savingsGoal) || 0;
    if (goal > allowance) {
      const msg = allowance > 0
        ? `Savings goal cannot be more than your monthly allowance (${allowance}).`
        : 'Enter your monthly allowance before setting a savings goal.';
      setError(msg);
      toast.error(msg);
      return;
    }

    setBusy(true);
    setError('');
    try {
      await register({
        name: form.name.trim(),
        email: form.email.toLowerCase().trim(),
        password: form.password,
        academicYear: form.academicYear,
        monthlyAllowance: Number(form.monthlyAllowance) || 0,
        savingsGoal: Number(form.savingsGoal) || 0
      });
      toast.success('Account created. Log your first entry to get started.');
      navigate('/app');
    } catch (err) {
      setError(err.message);
      toast.error(err.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Create your account"
      subtitle="Two minutes now, a clear picture of your money from next week."
      featuredTitle
      aside={STUDENT_ASIDE}
      foot={<>Already registered? <Link to="/login" className="strong" style={{ color: 'var(--honey-deep)' }}>Sign in</Link></>}
    >
      <form onSubmit={submit} className="stack gap-3">
        {error && <Banner tone="danger" icon="alert">{error}</Banner>}

        <Field label="Full name" required>
          <input 
            className="input" 
            value={form.name} 
            onChange={(e) => {
              const val = e.target.value;
              // Allow only letters and spaces
              if (/^[A-Za-z\s]*$/.test(val)) {
                setForm({ ...form, name: val });
              }
            }} 
            placeholder="Ayesha Khan" 
            required 
            title="Name cannot contain numbers" 
          />
        </Field>

        <Field label="Email" required>
          <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@university.edu" required />
        </Field>

        <div className="grid grid-2">
          <Field label="Password" required hint="Min 8 chars, uppercase, lowercase, number, special char.">
            <input className="input" type="password" value={form.password} onChange={set('password')} required />
          </Field>
          <Field label="Confirm password" required>
            <input className="input" type="password" value={form.confirm} onChange={set('confirm')} required />
          </Field>
        </div>

        <hr className="divider" />
        <p className="small dim" style={{ marginTop: '-0.4rem' }}>
          Optional, and changeable later — these make your tips and savings tracking more accurate.
        </p>

        <div className="grid grid-3">
          <Field label="Academic year">
            <select className="select" value={form.academicYear} onChange={set('academicYear')}>
              <option value="">Select…</option>
              {['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate', 'Other'].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </Field>
          <Field label="Monthly allowance">
            <input className="input" type="number" min="0" step="1" value={form.monthlyAllowance} onChange={set('monthlyAllowance')} placeholder="400" />
          </Field>
          <Field label="Savings goal">
            <input className="input" type="number" min="0" step="1" value={form.savingsGoal} onChange={set('savingsGoal')} placeholder="80" />
          </Field>
        </div>

        <Button type="submit" variant="primary" className="btn-block" loading={busy}>Create account</Button>
      </form>
    </AuthFrame>
  );
}

/* ------------------------------------------------------ forgot password */

export function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Validate email format
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const submit = async (event) => {
    event.preventDefault();
    if (!emailValid) {
      const msg = 'Please enter a valid email address.';
      setError(msg);
      toast.error(msg);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/auth/forgot-password', { email });
      setResult(data);
      toast.success(data.message || 'Password reset link sent to your email.');
      // Start 60-second cooldown for "Resend"
      setCooldown(60);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.message);
      toast.error(err.message || 'Failed to send reset link.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/auth/forgot-password', { email });
      setResult(data);
      toast.success(data.message || 'Password reset link resent.');
      setCooldown(60);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.message);
      toast.error(err.message || 'Failed to resend reset link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Reset your password"
      subtitle="Enter your email and we will send a link that sets a new one."
      aside={STUDENT_ASIDE}
      foot={<Link to="/login" className="strong" style={{ color: 'var(--honey-deep)' }}>Back to sign in</Link>}
    >
      {result ? (
        <div className="stack gap-3">
          <Banner tone="good" icon="check" title="Check your inbox">{result.message}</Banner>

          {/* Shown only when the server has no SMTP configured, so the flow stays testable. */}
          {result.devResetLink && (
            <Banner tone="honey" icon="info" title="Development mode">
              <span className="small">Mail is not set up on this server, so use this link directly:</span>
              <a
                href={result.devResetLink}
                className="strong small"
                style={{ display: 'block', marginTop: 6, wordBreak: 'break-all', color: 'var(--honey-deep)' }}
              >
                {result.devResetLink}
              </a>
            </Banner>
          )}

          <div aria-live="polite" style={{ textAlign: 'center' }}>
            {cooldown > 0 ? (
              <p className="small muted">Didn't receive it? Resend in {cooldown}s</p>
            ) : (
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={resend}
                disabled={busy}
                style={{ color: 'var(--primary)' }}
              >
                {busy ? 'Sending…' : 'Resend link'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="stack gap-3" noValidate>
          <div aria-live="polite" aria-atomic="true">
            {error && <Banner tone="danger" icon="alert">{error}</Banner>}
          </div>
          <Field label="Email" required>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="you@university.edu"
              autoComplete="email"
              required
            />
          </Field>
          <Button type="submit" variant="primary" className="btn-block" loading={busy} disabled={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}

/* ------------------------------------------------------- reset password */

function passwordStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score++;
  if (score <= 2) return { label: 'Weak', color: '#EF4444', width: '33%' };
  if (score <= 3) return { label: 'Fair', color: '#F59E0B', width: '60%' };
  return { label: 'Strong', color: '#16A34A', width: '100%' };
}

function validatePasswordStrength(pwd) {
  if (!pwd || pwd.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(pwd)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number.';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return 'Password must contain at least one special character (!@#$%^&* etc.).';
  return null;
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [linkError, setLinkError] = useState('');

  const token = params.get('token');
  const email = params.get('email');

  const strength = passwordStrength(password);

  // Auto-redirect countdown after success
  useState(() => {
    if (!success) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); navigate('/login'); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  });

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const pwdError = validatePasswordStrength(password);
    if (pwdError) {
      setError(pwdError);
      toast.error(pwdError);
      return;
    }
    if (password !== confirm) {
      const msg = 'The two passwords do not match.';
      setError(msg);
      toast.error(msg);
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, email, password });
      setSuccess(true);
      toast.success('Password changed! Redirecting to sign in…');
      // Start countdown
      let secs = 5;
      const interval = setInterval(() => {
        secs -= 1;
        setCountdown(secs);
        if (secs <= 0) { clearInterval(interval); navigate('/login'); }
      }, 1000);
    } catch (err) {
      // Distinguish "link expired / invalid" vs other errors
      const msg = err.message || '';
      if (/expired|not valid|incomplete/i.test(msg)) {
        setLinkError(msg);
      } else {
        setError(msg);
      }
      toast.error(msg || 'Failed to change password.');
    } finally {
      setBusy(false);
    }
  };

  // Link is completely missing from URL
  if (!token || !email) {
    return (
      <AuthFrame title="Link incomplete" aside={STUDENT_ASIDE}>
        <Banner tone="danger" icon="alert" title="This link is incomplete">
          Request a new one from the <Link to="/forgot-password" className="strong">forgot password</Link> page.
        </Banner>
      </AuthFrame>
    );
  }

  // Link was rejected by server (expired / already used)
  if (linkError) {
    return (
      <AuthFrame title="Link expired" aside={STUDENT_ASIDE}>
        <div className="stack gap-3">
          <Banner tone="danger" icon="alert" title="This link is no longer valid">
            {linkError}
          </Banner>
          <Link to="/forgot-password">
            <Button variant="primary" className="btn-block">Request a new reset link</Button>
          </Link>
        </div>
      </AuthFrame>
    );
  }

  // Success state
  if (success) {
    return (
      <AuthFrame title="Password changed" aside={STUDENT_ASIDE}>
        <div className="stack gap-3">
          <Banner tone="good" icon="check" title="All done!">
            Your password has been changed successfully.
          </Banner>
          <p className="small muted center" aria-live="polite">
            Redirecting to sign in in {countdown}s…
          </p>
          <Link to="/login">
            <Button variant="primary" className="btn-block">Sign in now</Button>
          </Link>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Choose a new password" subtitle={email ? `For ${email}` : undefined} aside={STUDENT_ASIDE}>
      <form onSubmit={submit} className="stack gap-3" noValidate>
        <div aria-live="polite" aria-atomic="true">
          {error && <Banner tone="danger" icon="alert">{error}</Banner>}
        </div>

        <Field label="New password" required hint="Min 8 chars, uppercase, lowercase, number, special char.">
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              autoComplete="new-password"
              required
              style={{ paddingRight: '2.6rem' }}
            />
            <button
              type="button"
              aria-label={showPwd ? 'Hide password' : 'Show password'}
              onClick={() => setShowPwd((v) => !v)}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4
              }}
            >
              <Icon name={showPwd ? 'eye-off' : 'eye'} size={16} />
            </button>
          </div>
          {/* Password strength bar */}
          {password.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ height: 4, borderRadius: 2, background: '#E5E7EB', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: strength.width, background: strength.color, transition: 'width 0.3s, background 0.3s' }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: strength.color, fontWeight: 600 }}>{strength.label}</span>
            </div>
          )}
        </Field>

        <Field label="Confirm new password" required>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(''); }}
              autoComplete="new-password"
              required
              style={{ paddingRight: '2.6rem' }}
            />
            <button
              type="button"
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              onClick={() => setShowConfirm((v) => !v)}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4
              }}
            >
              <Icon name={showConfirm ? 'eye-off' : 'eye'} size={16} />
            </button>
          </div>
        </Field>

        <Button type="submit" variant="primary" className="btn-block" loading={busy} disabled={busy}>
          Change password
        </Button>
      </form>
    </AuthFrame>
  );
}

/* ----------------------------------------------------------- admin login removed - use unified login */
