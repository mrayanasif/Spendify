const Tip = require('../models/Tip');
const Announcement = require('../models/Announcement');
const Transaction = require('../models/Transaction');
const analytics = require('../services/analytics');
const ai = require('./ai');
const { monthKey, monthStart, monthEnd, shiftMonth, monthLabel } = require('../utils/dates');

/**
 * Personalised saving tips.
 *
 * Every tip is derived from the student's own rows — current month against
 * their three-month average, and against the budgets they set. Each carries a
 * `potentialSaving`, which is what the list is ranked by, so the advice worth
 * the most money sits at the top of the dashboard.
 *
 * Tips are upserted by a stable `key`, so re-running the generator refreshes the
 * numbers without resurrecting something the student dismissed.
 */

const money = (n, currency = 'USD') =>
  `${currency === 'USD' ? '$' : ''}${analytics.round(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;

/* ------------------------------------------------------------ AI wording */

/**
 * The rules above decide *what* the tip is, what it is worth and where it
 * ranks. This layer only rewrites how it is phrased.
 *
 * Two hard rules:
 *   1. The numbers, category names and month come from the rule engine and are
 *      restated in the prompt; the model is told not to change them.
 *   2. If the model is off, slow or returns something unusable, the templated
 *      text is used unchanged — a tip is never lost because of the AI.
 *
 * Results are cached by (user, month, currency, key, amount, template) for a
 * few minutes, because the dashboard and the tips page both regenerate on load
 * and the same student should not pay for the same paragraph twice.
 */

const AI_CACHE_TTL_MS = 15 * 60 * 1000;
const AI_CACHE_MAX = 40;
const aiCache = new Map();

function candidateSignature(user, candidates, month, currency) {
  return JSON.stringify({
    user: String(user._id),
    month,
    currency,
    items: candidates.map((c) => [c.key, Math.round((c.potentialSaving || 0) * 100), c.title, c.body])
  });
}

/** Applies whatever wording the model returned; anything missing keeps its template. */
function applyWording(candidates, byKey) {
  if (!byKey || !byKey.size) return candidates;

  return candidates.map((candidate) => {
    const text = byKey.get(candidate.key);
    if (!text) return candidate;
    return { ...candidate, title: text.title || candidate.title, body: text.body || candidate.body };
  });
}

async function aiWording(candidates, user, month) {
  if (!ai.isConfigured() || !candidates.length) return candidates;

  const currency = user.preferences?.currency || 'USD';
  const signature = candidateSignature(user, candidates, month, currency);

  const cached = aiCache.get(signature);
  if (cached && Date.now() - cached.at < AI_CACHE_TTL_MS) {
    return applyWording(candidates, cached.byKey);
  }

  const list = candidates.map((candidate, index) => ({
    id: String(index + 1),
    hint: candidate.title,
    detail: candidate.body
  }));

  const prompt = `You are the saving-tips writer inside Spendify, a student budget app.
Each item below is a real tip that has already been calculated. Rewrite it shorter and cleaner.

Rules:
- Keep every figure from "detail" exactly as written (same digits, same currency symbol).
- Keep the category name.
- Do not invent numbers or advice the figures do not support.
- Do not mention the month or the year.
- title: one line, max 48 characters, short and direct.
- body: exactly 1 short sentence, max 90 characters. Make it concise.
- Every tip should start differently.
- Avoid fluff words like "try to", "consider", "maybe".

Currency: ${currency}
Month: ${monthLabel(month)}

${JSON.stringify(list, null, 2)}

Reply with JSON only, exactly in this shape:
{"tips":[{"id":"1","title":"max 48 chars","body":"1 short sentence, max 90 chars"}]}

Return exactly ${list.length} items, one per id, in the same order.`;

  try {
    const parsed = await ai.generateJson({ prompt, temperature: 0.8, maxOutputTokens: 2048 });
    const rows = Array.isArray(parsed?.tips) ? parsed.tips : [];

    const byKey = new Map();
    for (const row of rows) {
      const candidate = candidates[Number(row?.id) - 1];
      if (!candidate) continue;

      const title = typeof row.title === 'string' ? row.title.trim().slice(0, 48) : '';
      const body = typeof row.body === 'string' ? row.body.trim().slice(0, 90) : '';
      if (!title || title.length < 3 || !body || body.length < 5) continue;

      byKey.set(candidate.key, { title, body });
    }

    if (!byKey.size) throw new ai.AiError('No usable tips in the reply.', 'invalid_json');

    aiCache.set(signature, { at: Date.now(), byKey });
    if (aiCache.size > AI_CACHE_MAX) {
      const oldest = [...aiCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) aiCache.delete(oldest[0]);
    }

    return applyWording(candidates, byKey);
  } catch (err) {
    console.warn(
      `  tips       : AI unavailable (${err.code || 'error'}: ${String(err.message).slice(0, 140)}) — using the local wording.`
    );
    return candidates;
  }
}

async function buildCandidates(user, month) {
  const currency = user.preferences?.currency || 'USD';
  const candidates = [];

  const [trend, budgets, totals, previousTotals] = await Promise.all([
    analytics.categoryTrend(user._id, month),
    analytics.budgetProgress(user._id, month),
    analytics.monthTotals(user._id, month),
    analytics.monthTotals(user._id, shiftMonth(month, -1))
  ]);

  /* 1. Categories running hot against the student's own average. */
  for (const row of trend) {
    if (row.monthsOfHistory < 2 || row.changePercent === null) continue;
    if (row.changePercent < 15 || row.change < 3) continue;

    const weeklyCap = analytics.round(row.previousAverage / 4);
    candidates.push({
      key: `overspend:${row.categoryId}`,
      title: `${row.name} is up ${Math.round(row.changePercent)}% this month`,
      body:
        `You have spent ${money(row.total, currency)} on ${row.name}, ` +
        `${money(row.change, currency)} more than your usual ${money(row.previousAverage, currency)}. ` +
        `Capping it at about ${money(weeklyCap, currency)} a week would bring you back to your normal pace.`,
      category: row.categoryId,
      potentialSaving: row.change
    });
  }

  /* 2. Budgets already broken, or close to it. */
  for (const budget of budgets) {
    if (budget.state === 'over') {
      candidates.push({
        key: `budget-over:${budget.categoryId}`,
        title: `${budget.name} has passed its budget`,
        body:
          `Your ${budget.name} budget was ${money(budget.limitAmount, currency)} and you are at ` +
          `${money(budget.spent, currency)}. Pausing this category for the rest of the month keeps the ` +
          `overspend from growing past ${money(Math.abs(budget.remaining), currency)}.`,
        category: budget.categoryId,
        potentialSaving: Math.abs(budget.remaining)
      });
    } else if (budget.state === 'near') {
      candidates.push({
        key: `budget-near:${budget.categoryId}`,
        title: `${budget.name} is at ${Math.round(budget.percent)}% of budget`,
        body:
          `Only ${money(budget.remaining, currency)} is left in your ${budget.name} budget. ` +
          `Spreading that across the rest of the month keeps you inside the limit.`,
        category: budget.categoryId,
        potentialSaving: budget.remaining * 0.5
      });
    }
  }

  /* 3. Savings goal against what is actually left. */
  if (user.savingsGoal > 0) {
    const shortfall = user.savingsGoal - totals.balance;
    if (shortfall > 0 && totals.income > 0) {
      candidates.push({
        key: `savings-goal:${month}`,
        title: `You are ${money(shortfall, currency)} short of your savings goal`,
        body:
          `Your goal is ${money(user.savingsGoal, currency)} a month and this month's balance is ` +
          `${money(totals.balance, currency)}. Trimming your largest category by about ` +
          `${money(shortfall / 4, currency)} a week closes the gap.`,
        potentialSaving: shortfall
      });
    }
  }

  /* 4. Subscriptions — small individually, quietly large together. */
  const subscriptionSpend = trend.find((r) => /subscription/i.test(r.name));
  if (subscriptionSpend && subscriptionSpend.count >= 2) {
    candidates.push({
      key: `subscriptions:${month}`,
      title: `${subscriptionSpend.count} subscription charges this month`,
      body:
        `Subscriptions cost you ${money(subscriptionSpend.total, currency)} in ${monthLabel(month)}. ` +
        `Cancelling the one you opened least often would save about ` +
        `${money(subscriptionSpend.total / subscriptionSpend.count, currency)} every month.`,
      category: subscriptionSpend.categoryId,
      potentialSaving: subscriptionSpend.total / subscriptionSpend.count
    });
  }

  /* 5. Spending outrunning income. */
  if (totals.expense > totals.income && totals.income > 0) {
    candidates.push({
      key: `deficit:${month}`,
      title: 'You are spending more than you received',
      body:
        `${monthLabel(month)} is at ${money(totals.expense, currency)} spent against ` +
        `${money(totals.income, currency)} received. The gap is ${money(totals.expense - totals.income, currency)} — ` +
        `worth covering before it turns into borrowing.`,
      potentialSaving: totals.expense - totals.income
    });
  }

  /* 6. Many small purchases in one category. */
  const frequent = trend
    .filter((r) => r.count >= 8 && r.total / r.count < 10)
    .sort((a, b) => b.count - a.count)[0];
  if (frequent) {
    candidates.push({
      key: `small-spends:${frequent.categoryId}`,
      title: `${frequent.count} small ${frequent.name} purchases add up`,
      body:
        `Each one averaged ${money(frequent.total / frequent.count, currency)} but together they came to ` +
        `${money(frequent.total, currency)}. Skipping two a week would keep about ` +
        `${money((frequent.total / frequent.count) * 8, currency)} a month.`,
      category: frequent.categoryId,
      potentialSaving: (frequent.total / frequent.count) * 8
    });
  }

  /* 7. Progress worth noticing — kept so the feed is not only bad news. */
  if (previousTotals.expense > 0 && totals.expense < previousTotals.expense * 0.9) {
    const saved = previousTotals.expense - totals.expense;
    candidates.push({
      key: `improvement:${month}`,
      title: `You spent ${money(saved, currency)} less than last month`,
      body:
        `${monthLabel(month)} is down to ${money(totals.expense, currency)} from ` +
        `${money(previousTotals.expense, currency)}. Moving that difference into savings now makes the ` +
        `improvement permanent.`,
      potentialSaving: saved
    });
  }

  return candidates;
}

/** Generic advice used while a student has too little history for real tips. */
async function starterTips(month) {
  const templates = await Announcement.find({ kind: 'tipTemplate', active: true }).limit(4).lean();
  return templates.map((t) => ({
    key: `starter:${t._id}`,
    title: t.title,
    body: t.body,
    potentialSaving: 0,
    month
  }));
}

/**
 * Regenerates tips for a student and returns the visible ones, ranked.
 * Dismissed tips stay dismissed; pinned tips always come back first.
 */
async function generateTips(user, month = monthKey()) {
  const transactionCount = await Transaction.countDocuments({ user: user._id, deletedAt: null });

  let candidates = await buildCandidates(user, month);
  if (candidates.length < 2 && transactionCount < 10) {
    candidates = [...candidates, ...(await starterTips(month))];
  }

  // Rules decide the content and the ranking; the model only changes the prose.
  candidates = await aiWording(candidates, user, month);

  if (candidates.length) {
    await Tip.bulkWrite(
      candidates.map((c) => ({
        updateOne: {
          filter: { user: user._id, key: c.key },
          update: {
            $set: {
              title: c.title,
              body: c.body,
              category: c.category || null,
              potentialSaving: analytics.round(c.potentialSaving || 0),
              month,
              lastSeenAt: new Date()
            },
            $setOnInsert: { user: user._id, key: c.key, status: 'active' }
          },
          upsert: true
        }
      })),
      { ordered: false }
    );
  }

  return listTips(user._id, { includeDismissed: false });
}

/** Pinned first, then by how much money the tip could save. */
async function listTips(userId, { includeDismissed = false } = {}) {
  const filter = { user: userId };
  if (!includeDismissed) filter.status = { $ne: 'dismissed' };

  const tips = await Tip.find(filter).populate('category', 'name color icon').lean();

  return tips.sort((a, b) => {
    if (a.status === 'pinned' && b.status !== 'pinned') return -1;
    if (b.status === 'pinned' && a.status !== 'pinned') return 1;
    return (b.potentialSaving || 0) - (a.potentialSaving || 0);
  });
}

module.exports = { generateTips, listTips };
