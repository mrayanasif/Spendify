const Insight = require('../models/Insight');
const analytics = require('./analytics');
const ai = require('./ai');
const { monthKey, shiftMonth, monthLabel } = require('../utils/dates');

/**
 * Monthly spending insights.
 *
 * The narrative is composed from the student's own aggregates: month totals,
 * category trend against their three-month average, and budget outcomes. When
 * DEEPSEEK_API_KEY is configured in server/.env the same figures are handed to
 * the model for a friendlier rewrite; when it is missing, rate-limited, or
 * returns something unusable, the local writer below produces the text instead.
 * Either way the numbers in the prompt come from this student's rows only.
 */

function money(n, currency = 'USD') {
  const value = analytics.round(n);
  const prefix = ({
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    PKR: '₨',
    AED: 'د.إ'
  })[currency] || `${currency} `;
  const sign = value < 0 ? '-' : '';
  return `${sign}${prefix}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function buildNarrative({ user, month, totals, trend, budgets, previous }) {
  const currency = user.preferences?.currency || 'USD';
  const m = (n) => money(n, currency);

  /* Opening: the shape of the month. */
  if (totals.transactionCount === 0) {
    return {
      summary: 'There is no activity to review yet. Log a few entries to see how your spending changes.',
      tip: 'Log purchases as they happen to build a useful monthly picture.',
      highlights: []
    };
  }

  const top = trend[0];

  const movers = trend
    .filter((r) => r.changePercent !== null && r.changePercent >= 25 && r.change >= 5 && r.monthsOfHistory >= 2)
    .sort((a, b) => b.change - a.change);
  const mover = movers[0];
  const over = budgets.filter((b) => b.state === 'over');

  const summary = [
    totals.balance >= 0 ? 'You kept spending within your income.' : 'Spending ran ahead of your income.',
    mover
      ? `${mover.name} spending rose the most.`
      : over[0]
        ? `Your ${over[0].name} budget went over.`
        : top
          ? `${top.name} was your largest spending category.`
          : 'You stayed within your budgets.'
  ].join(' ');

  let tip;
  if (mover) {
    tip = `Set a weekly limit for ${mover.name} and log purchases as you go.`;
  } else if (over.length) {
    tip = `Adjust your ${over[0].name} budget to a limit you can realistically follow.`;
  } else if (totals.balance < 0) {
    tip = 'Set limits for your biggest categories before spending next month.';
  } else if (user.savingsGoal > 0 && totals.balance < user.savingsGoal) {
    tip = 'Move savings aside when income arrives, then budget what remains.';
  } else if (top) {
    tip = `Trim ${top.name} spending slightly and track purchases throughout the month.`;
  } else {
    tip = 'Keep logging purchases so next month reflects your spending habits.';
  }

  /* Dashboard chips. */
  const highlights = [];
  if (top) {
    highlights.push({ label: 'Top', value: `${top.name} · ${m(top.total)}`, direction: 'flat', tone: 'neutral' });
  }
  highlights.push({
    label: 'Balance',
    value: m(totals.balance),
    direction: totals.balance >= 0 ? 'up' : 'down',
    tone: totals.balance >= 0 ? 'good' : 'bad'
  });
  if (mover) {
    highlights.push({
      label: 'Rise',
      value: `${mover.name} +${Math.round(mover.changePercent)}%`,
      direction: 'up',
      tone: 'warn'
    });
  }
  if (previous.expense > 0) {
    const diff = totals.expense - previous.expense;
    highlights.push({
      label: 'Vs prev.',
      value: `${diff >= 0 ? '+' : '-'}${m(Math.abs(diff))}`,
      direction: diff >= 0 ? 'up' : 'down',
      tone: diff >= 0 ? 'warn' : 'good'
    });
  }

  return { summary, tip, highlights };
}

/* ------------------------------------------------------------- AI writer */

const TONES = new Set(['good', 'warn', 'bad', 'neutral']);
const DIRECTIONS = new Set(['up', 'down', 'flat']);

/** Keeps whatever the model returns inside the Insight schema's enums. */
function normaliseHighlightValue(value, currency) {
  const code = String(currency).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const amount = '(\\d[\\d,]*(?:\\.\\d+)?)';
  const format = (sign, rawAmount) => money(
    Number(rawAmount.replace(/,/g, '')) * (sign === '-' ? -1 : 1),
    currency
  );
  let result = String(value || '').trim();
  result = result.replace(new RegExp(`(-?)${amount}\\s*${code}\\b`, 'gi'), (_, sign, rawAmount) =>
    format(sign, rawAmount)
  );
  result = result.replace(new RegExp(`\\b${code}\\s+(-?)${amount}`, 'gi'), (_, sign, rawAmount) =>
    format(sign, rawAmount)
  );
  return result;
}

function normaliseHighlights(input, currency) {
  if (!Array.isArray(input)) return [];

  return input
    .filter((h) => h && typeof h === 'object')
    .map((h) => ({
      label: ({
        'top category': 'Top',
        balance: 'Balance',
        'biggest rise': 'Rise',
        'vs last month': 'Vs prev.'
      })[String(h.label || '').trim().toLowerCase()] || String(h.label || '').trim().slice(0, 12),
      value: normaliseHighlightValue(h.value, currency).slice(0, 60),
      direction: DIRECTIONS.has(h.direction) ? h.direction : 'flat',
      tone: TONES.has(h.tone) ? h.tone : 'neutral'
    }))
    .filter((h) => h.label && h.value)
    .slice(0, 4);
}

function isShortSummary(text) {
  const sentences = String(text).match(/[^.!?]+[.!?]*/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  return sentences.length > 0 &&
    sentences.length <= 2 &&
    sentences.every((sentence) => sentence.split(/\s+/).length <= 18) &&
    !/[0-9$€£₹₨]/.test(text);
}

function isShortTip(text) {
  const sentences = String(text).split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean);
  return sentences.length === 1 && text.trim().split(/\s+/).length <= 20;
}

/**
 * Asks the configured model for the monthly narrative.
 * Returns `null` when AI is off; throws AiError when it is on but unusable, so
 * the caller can log a reason and fall back to `buildNarrative`.
 */
async function aiNarrative({ user, month, totals, trend, budgets, previous }) {
  if (!ai.isConfigured()) return null;

  const currency = user.preferences?.currency || 'USD';
  const prompt = `You write the monthly review inside Spendify, a student budget app.
Use only these figures from the student's entries. Do not invent facts or product advice.
Keep the tone plain, practical and encouraging.

Month: ${monthLabel(month)} (${month})
Income: ${totals.income} ${currency}
Expenses: ${totals.expense} ${currency}
Balance: ${totals.balance} ${currency}
Transactions logged: ${totals.transactionCount}
Savings goal: ${user.savingsGoal || 0} ${currency}
Previous month expenses: ${previous.expense} ${currency}
Budgets tracked: ${budgets.length}; over budget: ${budgets.filter((b) => b.state === 'over').length}

Top categories:
${trend.slice(0, 3).map((t) => `- ${t.name}: ${t.total} ${currency} (${t.share}% of spending, change vs their average: ${t.changePercent === null ? 'no history' : `${t.changePercent}%`})`).join('\n') || '- none logged'}

Return only JSON with these keys:
{"summary":"1-2 short sentences; no numbers or amounts","tip":"one sentence, at most 20 words; avoid amounts","highlights":[{"label":"short label","value":"short value; use $10,000 format, not 10000 USD","tone":"good|warn|bad|neutral"}]}

Use at most three highlights. Add no other keys.`;

  // The model occasionally returns a valid JSON object without the `summary`
  // string, or wraps the object in prose. Both are transient, so try twice
  // before giving up; auth, quota and timeout failures are not retried.
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const parsed = await ai.generateJson({ prompt, temperature: 0.7, maxOutputTokens: 240 });

      const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
      if (!isShortSummary(summary)) {
        throw new ai.AiError('The AI reply did not meet the short summary format.', 'invalid_json');
      }

      const tip = typeof parsed?.tip === 'string' ? parsed.tip.trim() : '';

      return {
        summary,
        tip: isShortTip(tip) ? tip : buildNarrative({ user, month, totals, trend, budgets, previous }).tip,
        highlights: normaliseHighlights(parsed?.highlights, currency)
      };
    } catch (err) {
      lastError = err;
      if (err.code !== 'invalid_json') break;
    }
  }

  throw lastError || new ai.AiError('The AI reply was unusable.', 'invalid_json');
}

/** Builds and stores the insight for one month, replacing any earlier version. */
async function generateInsight(user, month = monthKey()) {
  const [totals, trend, budgets, previous] = await Promise.all([
    analytics.monthTotals(user._id, month),
    analytics.categoryTrend(user._id, month),
    analytics.budgetProgress(user._id, month),
    analytics.monthTotals(user._id, shiftMonth(month, -1))
  ]);

  const facts = { user, month, totals, trend, budgets, previous };

  // Prefer the configured model; any failure falls back to the local writer
  // rather than failing the request or storing half a summary.
  let summaryResult = null;
  if (ai.isConfigured()) {
    try {
      summaryResult = await aiNarrative(facts);
    } catch (err) {
      console.warn(`  insights   : AI unavailable (${err.code || 'error'}: ${String(err.message).slice(0, 160)}) — using the local writer.`);
    }
  }
  if (!summaryResult) summaryResult = buildNarrative(facts);

  const { summary, tip, highlights } = summaryResult;

  const existing = await Insight.findOne({ user: user._id, month });

  const insight = await Insight.findOneAndUpdate(
    { user: user._id, month },
    {
      $set: {
        summaryText: summary,
        summaryVersion: 2,
        tipText: tip,
        highlights,
        stats: {
          income: totals.income,
          expense: totals.expense,
          balance: totals.balance,
          transactionCount: totals.transactionCount,
          topCategory: trend[0] ? { name: trend[0].name, total: trend[0].total, share: trend[0].share } : null,
          categories: trend.slice(0, 6).map((t) => ({
            name: t.name,
            color: t.color,
            total: t.total,
            changePercent: t.changePercent
          }))
        },
        generatedAt: new Date()
      },
      // A regenerated insight must not lose a bookmark the student set.
      $setOnInsert: { user: user._id, month, bookmarked: existing?.bookmarked || false }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return insight;
}

module.exports = { generateInsight };
