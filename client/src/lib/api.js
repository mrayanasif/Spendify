/**
 * Thin fetch wrapper.
 * Attaches the session token, unwraps JSON, and turns an API error payload into
 * a thrown Error carrying `status` so callers can branch on it.
 */

const BASE = '/api';
const TOKEN_KEY = 'campuscoin.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked — the session simply will not survive a reload */
  }
}

/** Fired on a 401 so AuthContext can clear the session from anywhere. */
export const SESSION_EXPIRED = 'campuscoin:session-expired';

async function request(path, { method = 'GET', body, query, raw = false, signal, suppressSessionExpired = false } = {}) {
  let url = `${BASE}${path}`;

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const isFormData = body instanceof FormData;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    signal,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
  });

  if (response.status === 401 && !suppressSessionExpired) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED));
  }

  if (raw) {
    if (!response.ok) throw new Error('That download could not be prepared.');
    return response;
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.details = payload?.details || null;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export const api = {
  get: (path, query, options) => request(path, { ...options, query }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path, query) => request(path, { method: 'DELETE', query }),
  raw: (path, query) => request(path, { query, raw: true })
};
