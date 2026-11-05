/** Formatting helpers shared across every screen. */

const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', INR: '₹', PKR: '₨', AED: 'د.إ' };

export function symbolFor(currency = 'USD') {
  return SYMBOLS[currency] || `${currency} `;
}

/** `$1,240.50`. Set `compact` for axis labels, where space is tight. */
export function money(value, currency = 'USD', { compact = false, sign = false } = {}) {
  const n = Number(value) || 0;
  const symbol = symbolFor(currency);
  const abs = Math.abs(n);

  let body;
  if (compact && abs >= 1000) {
    body = `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  } else {
    body = abs.toLocaleString('en-US', {
      minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  const prefix = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  return `${prefix}${symbol}${body}`;
}

export function percent(value, digits = 0) {
  const n = Number(value) || 0;
  return `${n.toFixed(digits)}%`;
}

export function shortDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function longDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "just now", "3 h ago", "12 Mar" — used in activity and notification lists. */
export function relativeTime(value) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return shortDate(value);
}

export function monthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return `${new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' })} ${y}`;
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

/** Month keys for a picker: this month back through `count - 1` earlier ones. */
export function recentMonths(count = 12) {
  const now = monthKey();
  return Array.from({ length: count }, (_, i) => shiftMonth(now, -i));
}

export function toInputDate(value = new Date()) {
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function greeting(hour = new Date().getHours()) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Deterministic colour for a category with none set. */
export function fallbackColor(seed = '') {
  const palette = ['#e8a317', '#2e9e6b', '#2f9ed8', '#7b6ef6', '#e4679b', '#f0803c', '#8d91a0'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return palette[hash % palette.length];
}
