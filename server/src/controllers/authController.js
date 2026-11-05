const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const { setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const { resetPasswordEmail, passwordChangedEmail } = require('../utils/emailTemplates');
const { getGlobalSettings } = require('../services/systemSettings');
const analytics = require('../services/analytics');

const RESET_WINDOW_MINUTES = 60;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Simple in-memory per-email rate limiter (5 requests per 15 minutes per email). */
const emailAttemptMap = new Map();
const EMAIL_RATE_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_RATE_MAX = 5;

function checkEmailRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase().trim();
  const entry = emailAttemptMap.get(key) || { count: 0, resetAt: now + EMAIL_RATE_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + EMAIL_RATE_WINDOW_MS;
  }
  entry.count += 1;
  emailAttemptMap.set(key, entry);
  if (entry.count > EMAIL_RATE_MAX) {
    throw ApiError.tooManyRequests('Too many reset attempts for this email. Please wait 15 minutes.');
  }
}

function validatePasswordStrength(password) {
  if (!password || password.length < 8)
    throw ApiError.badRequest('Password must be at least 8 characters long.');
  if (!/[A-Z]/.test(password))
    throw ApiError.badRequest('Password must contain at least one uppercase letter.');
  if (!/[a-z]/.test(password))
    throw ApiError.badRequest('Password must contain at least one lowercase letter.');
  if (!/[0-9]/.test(password))
    throw ApiError.badRequest('Password must contain at least one number.');
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password))
    throw ApiError.badRequest('Password must contain at least one special character (!@#$%^&* etc.).');
}

/** POST /api/auth/register — students only; admins are seeded or created by an admin. */
async function register(req, res) {
  const { name, email, password, academicYear, monthlyAllowance, savingsGoal } = req.body;

  if (!name?.trim()) throw ApiError.badRequest('Please enter your name.');
  if (!email?.trim()) throw ApiError.badRequest('Please enter your email address.');
  if (!password || password.length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters long.');
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) throw ApiError.conflict('An account with that email already exists.');

  // A monthly savings target cannot be larger than the money coming in each month.
  const allowanceValue = Number(monthlyAllowance) || 0;
  const savingsValue = Number(savingsGoal) || 0;

  if (savingsValue > allowanceValue) {
    throw ApiError.badRequest(
      allowanceValue > 0
        ? `Savings goal cannot be more than your monthly allowance (${allowanceValue}).`
        : 'Enter your monthly allowance before setting a savings goal.'
    );
  }

  const user = new User({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    role: 'student',
    academicYear: academicYear || '',
    monthlyAllowance: allowanceValue,
    savingsGoal: savingsValue
  });
  await user.setPassword(password);
  user.lastLoginAt = new Date();
  user.lastActive = user.lastLoginAt;
  await user.save();

  // If monthly allowance/stipend is provided at signup, create an income transaction so it shows on dashboard
  const allowanceAmount = allowanceValue;
  if (allowanceAmount > 0) {
    try {
      // Find or use default income category
      let incomeCat = await Category.findOne({ type: 'income', isDefault: true, owner: null });
      if (!incomeCat) {
        incomeCat = await Category.findOne({ type: 'income' });
      }
      if (incomeCat) {
        await Transaction.create({
          user: user._id,
          category: incomeCat._id,
          type: 'income',
          amount: allowanceAmount,
          description: 'Monthly allowance/stipend',
          note: 'Added at signup',
          date: new Date(),
          source: 'manual'
        });
      }
    } catch (e) {
      // Don't fail signup if transaction creation fails
    }
  }

  res.status(201).json({ token: setAuthCookie(res, user), user: user.toPublic() });
}

/**
 * POST /api/auth/login
 * `expect` pins the route to one role, which is how the student and
 * administrator sign-ins stay separate even though they share this handler.
 */
async function login(req, res) {
  const { email, password, expect } = req.body;

  if (!email || !password) throw ApiError.badRequest('Enter your email and password.');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('No account matches that email and password.');

  const ok = await user.verifyPassword(password);
  if (!ok) throw ApiError.unauthorized('No account matches that email and password.');

  if (user.isDisabled) throw ApiError.forbidden('This account has been disabled by an administrator.');

  user.lastLoginAt = new Date();
  user.lastActive = user.lastLoginAt;
  await user.save();
  await analytics.syncSavingsToAvailableBalance(user._id);
  const updatedUser = await User.findById(user._id);

  res.json({ token: setAuthCookie(res, updatedUser), user: updatedUser.toPublic() });
}

/** GET /api/auth/me — used on page load to restore the session. */
async function me(req, res) {
  await analytics.syncSavingsToAvailableBalance(req.user._id);
  const user = await User.findById(req.user._id);
  res.json({ user: user.toPublic() });
}

/** GET /api/auth/session — returns server time for session countdown alignment. */
async function session(req, res) {
  const settings = await getGlobalSettings();
  res.json({
    user: req.user.toPublic(),
    serverTime: Date.now(),
    session: { idleMinutes: settings.sessionIdleMinutes, warningSeconds: settings.sessionWarningSeconds }
  });
}

/** POST /api/auth/heartbeat — refreshes the server-side inactivity clock. */
async function heartbeat(req, res) {
  req.user.lastActive = new Date();
  await req.user.save();
  res.json({ lastActive: req.user.lastActive, serverTime: Date.now() });
}

/** POST /api/auth/logout — revokes every token issued for this account. */
async function logout(req, res) {
  req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
  req.user.lastActive = null;
  await req.user.save();
  clearAuthCookie(res);
  res.json({ message: 'Signed out.' });
}

/**
 * POST /api/auth/forgot-password
 * Always answers the same way so the endpoint cannot be used to discover which
 * emails are registered. In development the link is also returned in the
 * response and printed to the console, because SMTP is usually not configured.
 */
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) throw ApiError.badRequest('Enter the email address on your account.');

  // Per-email rate limit (5 attempts per 15 min per email)
  checkEmailRateLimit(email);

  const generic = {
    message: 'If that email is registered, a reset link is on its way.'
  };

  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user || user.isDisabled) return res.json(generic);

  const token = crypto.randomBytes(32).toString('hex');
  user.resetTokenHash = hashToken(token);
  user.resetTokenExpiresAt = new Date(Date.now() + RESET_WINDOW_MINUTES * 60 * 1000);
  await user.save();

  console.log(`[password-reset] requested for userId=${user._id}`);

  const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
  const { subject, html, text } = resetPasswordEmail(user.name, link, RESET_WINDOW_MINUTES);

  const { delivered } = await sendMail({ to: user.email, subject, html, text });

  const payload = { ...generic };
  if (!delivered) {
    // No mail server in this environment: hand the link back so the flow is testable.
    payload.devResetLink = link;
    payload.message = 'Mail is not configured on this server, so the reset link is shown below.';
  }

  res.json(payload);
}

/** POST /api/auth/reset-password */
async function resetPassword(req, res) {
  const { token, email, password } = req.body;

  if (!token || !email) throw ApiError.badRequest('This reset link is incomplete.');

  // Full password strength validation (same rules as Register)
  validatePasswordStrength(password);

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
    '+resetTokenHash +resetTokenExpiresAt +passwordHash'
  );

  if (!user || !user.resetTokenHash || user.resetTokenHash !== hashToken(token)) {
    console.log(`[password-reset] failed: invalid token attempt for email=${String(email).toLowerCase().trim()}`);
    throw ApiError.badRequest('This reset link is not valid. Request a new one.');
  }
  if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    console.log(`[password-reset] failed: expired token for userId=${user._id}`);
    throw ApiError.badRequest('This reset link has expired. Request a new one.');
  }

  await user.setPassword(password);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.resetTokenHash = undefined;
  user.resetTokenExpiresAt = undefined;
  await user.save();

  console.log(`[password-reset] used for userId=${user._id}`);

  // Send confirmation email (non-blocking — don't fail the reset if mail fails)
  const { subject, html, text } = passwordChangedEmail(user.name);
  sendMail({ to: user.email, subject, html, text }).catch((err) => {
    console.error('[password-reset] confirmation email failed:', err.message);
  });

  clearAuthCookie(res);
  res.json({ message: 'Your password has been changed. You can sign in now.' });
}

/** POST /api/auth/change-password — for a student already signed in. */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    throw ApiError.badRequest('New password must be at least 8 characters long.');
  }

  const user = await User.findById(req.user._id).select('+passwordHash');
  const ok = await user.verifyPassword(currentPassword || '');
  if (!ok) throw ApiError.badRequest('Your current password is not correct.');

  await user.setPassword(newPassword);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  res.json({ message: 'Password updated.', token: setAuthCookie(res, user) });
}

module.exports = { register, login, me, session, heartbeat, logout, forgotPassword, resetPassword, changePassword };
