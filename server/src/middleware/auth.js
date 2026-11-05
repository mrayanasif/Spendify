const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { getGlobalSettings } = require('../services/systemSettings');

const TOKEN_COOKIE = 'campuscoin.token';

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function getTokenCookieOptions() {
  const match = /^(\d+)\s*([smhd])$/i.exec(process.env.JWT_EXPIRES_IN || '7d');
  const durationMs = match
    ? Number(match[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()]
    : 7 * 86400000;

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: durationMs
  };
}

function setAuthCookie(res, user) {
  const token = signToken(user);
  res.cookie(TOKEN_COOKIE, token, getTokenCookieOptions());
  return token;
}

function clearAuthCookie(res) {
  const { maxAge, ...options } = getTokenCookieOptions();
  res.clearCookie(TOKEN_COOKIE, options);
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();

  const tokenCookie = String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TOKEN_COOKIE}=`));

  if (!tokenCookie) return null;
  try {
    return decodeURIComponent(tokenCookie.slice(TOKEN_COOKIE.length + 1));
  } catch {
    return null;
  }
}

/** Rejects the request unless a valid, non-disabled account is behind the token. */
async function requireAuth(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }

    const user = await User.findById(payload.sub).select('+passwordChangedAt');
    if (!user) throw ApiError.unauthorized('Account no longer exists.');
    if (user.isDisabled) throw ApiError.forbidden('This account has been disabled by an administrator.');
    if ((payload.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      throw ApiError.unauthorized('Your session has ended. Please sign in again.');
    }

    const inactiveFor = user.lastActive ? Date.now() - user.lastActive.getTime() : 0;
    const settings = await getGlobalSettings();
    const sessionLifetime = (settings.sessionIdleMinutes * 60 + settings.sessionWarningSeconds) * 1000;
    if (inactiveFor > sessionLifetime) {
      throw ApiError.unauthorized('Your session expired after a period of inactivity. Please sign in again.');
    }

    if (!user.lastActive || inactiveFor > 60 * 1000) {
      user.lastActive = new Date();
      await user.save();
    }

    // Invalidate tokens issued before a password change. Both sides are compared
    // in whole seconds because a JWT's `iat` has second precision — comparing it
    // against a millisecond Date rejected a token minted in the same second as
    // the change, which is exactly what happens when you sign in right after a
    // password reset.
    if (user.passwordChangedAt && payload.iat) {
      const changedAtSecond = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (payload.iat < changedAtSecond) {
        throw ApiError.unauthorized('Your session expired after a password change. Please sign in again.');
      }
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Use after `requireAuth` on routes only administrators may touch. */
function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(ApiError.forbidden('Administrator access required.'));
  }
  next();
}

/** Blocks admins from the student-only areas so the two panels stay separate. */
function requireStudent(req, _res, next) {
  if (!req.user || req.user.role !== 'student') {
    return next(ApiError.forbidden('This section is for student accounts.'));
  }
  next();
}

module.exports = {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireAdmin,
  requireStudent
};
