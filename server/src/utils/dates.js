/** Small date helpers. Everything month-shaped in this app is a `YYYY-MM` string. */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function monthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** First instant of a `YYYY-MM` month. */
function monthStart(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}

/** First instant of the following month — use as an exclusive upper bound. */
function monthEnd(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 1, 0, 0, 0, 0);
}

/** `shiftMonth('2026-01', -1) === '2025-12'` */
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

/** The last `count` month keys ending at `key`, oldest first. */
function lastMonths(count, key = monthKey()) {
  return Array.from({ length: count }, (_, i) => shiftMonth(key, i - (count - 1)));
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function shortMonthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** ISO week-of-month (1-based) used by the weekly spending summary. */
function weekOfMonth(date) {
  const d = new Date(date);
  return Math.floor((d.getDate() - 1) / 7) + 1;
}

function toISODate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = {
  MONTH_NAMES,
  monthKey,
  monthStart,
  monthEnd,
  shiftMonth,
  lastMonths,
  monthLabel,
  shortMonthLabel,
  daysInMonth,
  startOfDay,
  addDays,
  addMonths,
  weekOfMonth,
  toISODate
};
