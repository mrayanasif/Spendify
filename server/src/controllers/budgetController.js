const Budget = require('../models/Budget');
const Category = require('../models/Category');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const analytics = require('../services/analytics');
const { checkBudgetAlerts } = require('../services/budgetAlerts');
const { monthKey, shiftMonth } = require('../utils/dates');

/** GET /api/budgets?month=YYYY-MM — budgets joined with live spending. */
async function listBudgets(req, res) {
  const month = req.query.month || monthKey();
  const [progress, totals] = await Promise.all([
    analytics.budgetProgress(req.user._id, month),
    analytics.monthTotals(req.user._id, month)
  ]);

  const budgetTrend = await analytics.budgetDailySummary(
    req.user._id,
    month,
    progress.map((budget) => budget.categoryId)
  );
  const limitTotal = progress.reduce((sum, b) => sum + b.limitAmount, 0);
  const spentTotal = progress.reduce((sum, b) => sum + b.spent, 0);

  res.json({
    month,
    budgets: progress,
    summary: {
      limitTotal: analytics.round(limitTotal),
      spentTotal: analytics.round(spentTotal),
      remaining: analytics.round(limitTotal - spentTotal),
      percent: limitTotal ? analytics.round((spentTotal / limitTotal) * 100) : 0,
      unbudgetedSpend: analytics.round(Math.max(0, totals.expense - spentTotal)),
      trend: budgetTrend
    }
  });
}

/** POST /api/budgets — create or update the cap for one category in one month. */
async function upsertBudget(req, res) {
  const { category, month = monthKey(), limitAmount } = req.body;

  if (!/^\d{4}-\d{2}$/.test(month)) throw ApiError.badRequest('Month must look like 2026-09.');
  const limit = Number(limitAmount);
  if (!Number.isFinite(limit) || limit <= 0) throw ApiError.badRequest('Enter a budget amount greater than zero.');

  const found = await Category.findOne({
    _id: category,
    type: 'expense',
    $or: [{ owner: req.user._id }, { isDefault: true, owner: null }]
  });
  if (!found) throw ApiError.badRequest('Budgets can only be set on expense categories.');

  // Check budget vs income - budget should not exceed income
  const user = await User.findById(req.user._id).lean();
  let totals = await analytics.monthTotals(req.user._id, month);
  let income = totals.income || user?.monthlyAllowance || 0;
  if (totals.income === 0 && user?.monthlyAllowance > 0) {
    income = user.monthlyAllowance;
  }
  
  // Get all budgets for this month
  const allBudgets = await Budget.find({ user: req.user._id, month }).lean();
  const otherBudgetsTotal = allBudgets
    .filter(b => String(b.category) !== String(category))
    .reduce((sum, b) => sum + (b.limitAmount || 0), 0);
  
  if (income > 0 && (otherBudgetsTotal + limit) > income) {
    throw ApiError.badRequest(`Budget cannot exceed your income/allowance (${income}). Total would be ${otherBudgetsTotal + limit}.`);
  }

  const budget = await Budget.findOneAndUpdate(
    { user: req.user._id, category, month },
    { $set: { limitAmount: analytics.round(limit) }, $setOnInsert: { alertsSent: [] } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate('category', 'name color icon');

  await checkBudgetAlerts(req.user, month);
  res.status(201).json({ budget });
}

/** DELETE /api/budgets/:id */
async function deleteBudget(req, res) {
  const budget = await Budget.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!budget) throw ApiError.notFound('Budget not found.');
  res.json({ message: 'Budget removed.' });
}

/**
 * POST /api/budgets/copy — carry last month's caps into this one.
 * Saves a student re-entering the same numbers every month.
 */
async function copyFromPreviousMonth(req, res) {
  const month = req.body.month || monthKey();
  const previous = shiftMonth(month, -1);

  const source = await Budget.find({ user: req.user._id, month: previous }).lean();
  if (!source.length) throw ApiError.badRequest(`You had no budgets set in ${previous}.`);

  await Budget.bulkWrite(
    source.map((b) => ({
      updateOne: {
        filter: { user: req.user._id, category: b.category, month },
        update: { $set: { limitAmount: b.limitAmount }, $setOnInsert: { alertsSent: [] } },
        upsert: true
      }
    }))
  );

  await checkBudgetAlerts(req.user, month);
  res.json({ message: `Copied ${source.length} budget${source.length === 1 ? '' : 's'} from ${previous}.`, count: source.length });
}

module.exports = { listBudgets, upsertBudget, deleteBudget, copyFromPreviousMonth };
