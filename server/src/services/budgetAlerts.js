const Budget = require('../models/Budget');
const Notification = require('../models/Notification');
const analytics = require('./analytics');
const { monthKey } = require('../utils/dates');

/**
 * Raises in-app notifications when a category nears (80%) or passes (100%) its
 * budget. `alertsSent` on the budget records which thresholds already fired, so
 * a student gets one warning per level per month rather than one per purchase.
 * Crossing back under a threshold clears it, so a corrected entry re-arms it.
 */
const THRESHOLDS = [
  { at: 100, level: 'danger', word: 'gone past' },
  { at: 80, level: 'warn', word: 'used 80% of' }
];

async function checkBudgetAlerts(user, month = monthKey()) {
  const progress = await analytics.budgetProgress(user._id, month);
  if (!progress.length) return [];

  const budgets = await Budget.find({ user: user._id, month });
  const byId = new Map(budgets.map((b) => [b._id.toString(), b]));
  const raised = [];

  for (const row of progress) {
    const budget = byId.get(row.budgetId.toString());
    if (!budget) continue;

    const sent = new Set(budget.alertsSent || []);
    let changed = false;

    for (const t of THRESHOLDS) {
      if (row.percent >= t.at && !sent.has(t.at)) {
        const notification = await Notification.create({
          user: user._id,
          title: `${row.name}: ${t.at === 100 ? 'budget exceeded' : 'budget almost used'}`,
          body:
            `You have ${t.word} your ${row.name} budget for this month — ` +
            `${row.spent} of ${row.limitAmount} spent` +
            (t.at === 100
              ? `, which is ${Math.abs(row.remaining)} over the limit.`
              : `, leaving ${row.remaining}.`),
          level: t.level,
          link: '/app/budgets'
        });
        raised.push(notification);
        sent.add(t.at);
        changed = true;
      } else if (row.percent < t.at && sent.has(t.at)) {
        sent.delete(t.at);
        changed = true;
      }
    }

    if (changed) {
      budget.alertsSent = [...sent];
      await budget.save();
    }
  }

  return raised;
}

async function getBudgetWarnings(user, month = monthKey(), categoryId) {
  const progress = await analytics.budgetProgress(user._id, month);
  return progress
    .filter((row) => row.spent > row.limitAmount && (!categoryId || String(row.categoryId) === String(categoryId)))
    .map((row) => ({
      type: 'budget_exceeded',
      level: 'danger',
      message: `Your "${row.name}" spending is Rs ${Math.abs(row.remaining)} over its budget limit (${row.spent} of ${row.limitAmount}).`
    }));
}

module.exports = { checkBudgetAlerts, getBudgetWarnings };
