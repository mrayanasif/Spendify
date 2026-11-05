const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const categorizer = require('../services/categorizer');
const analytics = require('../services/analytics');
const { requireExpenseBudget } = require('../services/expenseBudget');
const { checkBudgetAlerts, getBudgetWarnings } = require('../services/budgetAlerts');
const { runDueRecurring, firstRunDate } = require('../services/recurring');
const { monthKey } = require('../utils/dates');

async function assertOwnedCategory(userId, categoryId, type) {
  const category = await Category.findOne({
    _id: categoryId,
    type,
    isArchived: false,
    $or: [{ owner: userId }, { isDefault: true, owner: null }]
  });
  if (!category) throw ApiError.badRequest(`Choose a valid ${type} category.`);
  return category;
}

function log(userId, transactionId, action, changes = [], snapshot = {}) {
  return ActivityLog.create({ user: userId, transaction: transactionId, action, changes, snapshot });
}

/**
 * GET /api/transactions
 * Filters: type, category, from, to, q (text), flagged, page, limit, sort.
 */
async function listTransactions(req, res) {
  // Catch up on any recurring entries so the list a student sees is current.
  await runDueRecurring(req.user._id);

  const { type, category, from, to, q, flagged, source, paymentMethod, minAmount, maxAmount } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));

  const filter = { user: req.user._id, deletedAt: null };
  if (type === 'income' || type === 'expense') filter.type = type;
  if (category) filter.category = category;
  if (source) filter.source = source;
  if (['cash', 'card', 'digital_wallet'].includes(paymentMethod)) filter.paymentMethod = paymentMethod;
  if (minAmount !== undefined || maxAmount !== undefined) {
    filter.amount = {};
    if (Number.isFinite(Number(minAmount))) filter.amount.$gte = Math.max(0, Number(minAmount));
    if (Number.isFinite(Number(maxAmount))) filter.amount.$lte = Math.max(0, Number(maxAmount));
  }
  if (flagged === 'true') {
    filter.$or = [{ 'flags.unusuallyLarge': true }, { 'flags.possibleDuplicate': true }];
  }
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }
  if (q?.trim()) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and = [{ $or: [{ description: rx }, { note: rx }] }];
  }

  const sortField = req.query.sort === 'amount' ? 'amount' : 'date';
  const sortDir = req.query.order === 'asc' ? 1 : -1;
  const totalsFilter = {
    ...filter,
    user: req.user._id,
    $and: [...(filter.$and || []), { source: { $ne: 'receipt_scan' } }]
  };

  const [items, total, sums, categoryUsage] = await Promise.all([
    Transaction.find(filter)
      .populate('category', 'name color icon type')
      .sort({ [sortField]: sortDir, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(filter),
    Transaction.aggregate([
      { $match: totalsFilter },
      { $group: { _id: '$type', total: { $sum: '$amount' } } }
    ]),
    Transaction.aggregate([
      { $match: totalsFilter },
      { $group: { _id: '$category', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      { $sort: { count: -1, amount: -1 } },
      { $project: { _id: 0, categoryId: '$_id', name: '$category.name', count: 1, amount: 1 } }
    ])
  ]);

  const income = sums.find((s) => s._id === 'income')?.total || 0;
  const expense = sums.find((s) => s._id === 'expense')?.total || 0;

  res.json({
    items,
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    categoryUsage,
    totals: {
      income: analytics.round(income),
      expense: analytics.round(expense),
      balance: analytics.round(income - expense)
    }
  });
}

/** GET /api/transactions/:id — also records the view for the "recently viewed" list. */
async function getTransaction(req, res) {
  const transaction = await Transaction.findOne({ _id: req.params.id, user: req.user._id })
    .populate('category', 'name color icon type')
    .populate('suggestedCategory', 'name color');
  if (!transaction) throw ApiError.notFound('Transaction not found.');

  await log(req.user._id, transaction._id, 'viewed');
  res.json({ transaction });
}

/** POST /api/transactions */
async function createTransaction(req, res) {
  const {
    type, amount, category, description = '', note = '', date, paymentMethod = 'cash',
    isRecurring = false, recurrence = {}, suggestedCategory = null
  } = req.body;

  if (!['income', 'expense'].includes(type)) throw ApiError.badRequest('Choose income or expense.');
  if (!['cash', 'card', 'digital_wallet'].includes(paymentMethod)) throw ApiError.badRequest('Choose a valid payment method.');
  const value = Number(amount);
  if (!value || value <= 0) throw ApiError.badRequest('Enter an amount greater than zero.');

  const categoryDoc = await assertOwnedCategory(req.user._id, category, type);

  const when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) throw ApiError.badRequest('That date is not valid.');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const whenDay = new Date(when);
  whenDay.setHours(0, 0, 0, 0);
  if (whenDay > today) throw ApiError.badRequest('Future dates cannot be selected.');

  const mKey = monthKey(when);

  // Load user for allowance/savings context
  const user = await User.findById(req.user._id);

  // Compute current month totals
  let [totals, budgetProgress] = await Promise.all([
    analytics.monthTotals(req.user._id, mKey),
    analytics.budgetProgress(req.user._id, mKey)
  ]);

  // Include allowance in totals if no income
  if (totals.income === 0 && user?.monthlyAllowance > 0) {
    totals.income = analytics.round(user.monthlyAllowance);
    totals.balance = analytics.round(user.monthlyAllowance - totals.expense);
  }

  const alerts = [];
  let rawAvailable = 0;
  if (type === 'expense') {
    ({ rawAvailable } = await analytics.getAvailableBalance(req.user._id));

    const projectedExpense = totals.expense + value;
    const projectedBalance = (totals.income || 0) - projectedExpense;
    const savingsGoal = user?.savingsGoal || 0;

    // Savings goal warning
    if (savingsGoal > 0 && projectedBalance > 0 && projectedBalance < savingsGoal) {
      const freeAfterSavings = projectedBalance - savingsGoal;
      if (freeAfterSavings <= 200) {
        alerts.push({
          type: 'savings_warning',
          level: 'warn',
          message: `Only ${Math.max(0, freeAfterSavings)} left after your savings goal of ${savingsGoal}. Try to control your budget, don't use your savings.`
        });
      } else {
        alerts.push({
          type: 'savings_warning',
          level: 'warn',
          message: `Try to control your budget, don't use your savings. Remaining after this expense will be ${projectedBalance}, below your savings goal of ${savingsGoal}.`
        });
      }
    }

    // 2) Require a category budget; over-budget entries still use the permission flow.
    const catBudget = budgetProgress.find((b) => String(b.categoryId) === String(category));
    const catName = categoryDoc.name;

    if (catBudget) {
      const newSpent = catBudget.spent + value;
      if (newSpent > catBudget.limitAmount) {
        const need = analytics.round(newSpent - catBudget.limitAmount);
        alerts.push({
          type: 'budget_exceeded',
          level: 'warn',
          message: `This expense will put your "${catName}" spending ${need} over its budget limit.`
        });
        const balanceShortfall = analytics.round(Math.max(0, value - rawAvailable));
        const savingsRequired = analytics.round(Math.max(need, balanceShortfall, 0));
        if (!req.body.confirmOverride) {
          return res.json({
            needPermission: true,
            warningType: 'budget_exceeded',
            categoryName: catName,
            budgetLimit: catBudget.limitAmount,
            need,
            savingsRequired,
            savingsBalance: balanceShortfall > 0 ? 0 : (user?.currentSavings || 0),
            insufficientSavings: balanceShortfall > 0 || savingsRequired > (user?.currentSavings || 0),
            currentCategory: { categoryId: catBudget.categoryId, name: catBudget.name },
            message: `This expense will exceed your "${catName}" budget by Rs ${need}. The overage will be deducted from savings.`
          });
        }
        if (savingsRequired > 0) {
          if (!req.body.useSavings) {
            return res.json({
              needPermission: true,
              warningType: 'budget_exceeded',
              categoryName: catName,
              budgetLimit: catBudget.limitAmount,
              need,
              savingsRequired,
              savingsBalance: balanceShortfall > 0 ? 0 : (user?.currentSavings || 0),
              insufficientSavings: balanceShortfall > 0 || savingsRequired > (user?.currentSavings || 0),
              currentCategory: { categoryId: catBudget.categoryId, name: catBudget.name },
              message: `This expense exceeds your "${catName}" budget. Confirm to use savings for the overage.`
            });
          }
          if (savingsRequired > (user?.currentSavings || 0)) {
            throw ApiError.badRequest('Insufficient funds. Try managing your funds or reducing the transaction amount.');
          }
        }
      }
    } else {
      await requireExpenseBudget(req.user._id, category, mKey, catName);
    }

    const balanceShortfall = analytics.round(value - rawAvailable);
    if (balanceShortfall > 0) {
      if (!req.body.useSavings) {
        return res.json({
          needPermission: true,
          warningType: 'insufficient_balance',
          savingsRequired: balanceShortfall,
          savingsBalance: 0,
          insufficientSavings: true,
          message: `Your total available funds are short by Rs ${balanceShortfall}. The savings amount shown is already included in your balance. Reduce the amount or manage your funds before trying again.`
        });
      }
      throw ApiError.badRequest('Your total available funds are insufficient. Reduce the amount or manage your funds before trying again.');
    }

  }

  const payload = {
    user: req.user._id,
    type,
    amount: analytics.round(value),
    paymentMethod,
    category,
    description: String(description).trim(),
    note: String(note).trim(),
    date: when,
    source: 'manual',
    suggestedCategory: suggestedCategory || null,
    suggestionAccepted: suggestedCategory ? String(suggestedCategory) === String(category) : null
  };

  if (isRecurring) {
    const frequency = ['weekly', 'yearly'].includes(recurrence.frequency) ? recurrence.frequency : 'monthly';
    let endsOnDate = null;
    if (recurrence.endsOn) {
      endsOnDate = new Date(recurrence.endsOn);
      if (Number.isNaN(endsOnDate.getTime())) throw ApiError.badRequest('Stop date is not valid.');
      const endsDay = new Date(endsOnDate);
      endsDay.setHours(0, 0, 0, 0);
      if (endsDay < whenDay) throw ApiError.badRequest('Stop date cannot be earlier than the transaction date.');
    }
    payload.isRecurring = true;
    payload.recurrence = {
      frequency,
      nextRunOn: firstRunDate(when, frequency),
      endsOn: endsOnDate,
      active: true
    };
  }

  const transaction = await Transaction.create(payload);

  // Keep savings synchronized with the remaining total balance after each transaction.
  await analytics.syncTransactionSavings(req.user._id, transaction);

  // Teach the assistant, then refresh anomaly flags and budget alerts.
  if (payload.description) {
    await categorizer.learnFromTransaction(req.user._id, payload.description, category, suggestedCategory);
  }
  await analytics.refreshAnomalyFlags(req.user._id);
  const budgetAlerts = type === 'expense' ? await checkBudgetAlerts(req.user, mKey) : [];
  const warnings = [...alerts];
  budgetAlerts.forEach((alert) => {
    if (!warnings.some((warning) => warning.type === 'budget_exceeded')) {
      warnings.push({ type: 'budget_alert', level: alert.level, message: `${alert.title}. ${alert.body}` });
    }
  });
  if (type === 'expense') {
    const exceededWarnings = await getBudgetWarnings(req.user, mKey, category);
    exceededWarnings.forEach((warning) => {
      if (!warnings.some((existing) => existing.type === warning.type)) warnings.push(warning);
    });
  }

  await log(req.user._id, transaction._id, 'created', [], {
    amount: transaction.amount,
    paymentMethod: transaction.paymentMethod,
    description: transaction.description,
    date: transaction.date
  });

  const saved = await Transaction.findById(transaction._id).populate('category', 'name color icon type');
  res.status(201).json({ transaction: saved, alerts: budgetAlerts.length, warnings });
}

/** PUT /api/transactions/:id — the previous values are kept in the activity log. */
async function updateTransaction(req, res) {
  const transaction = await Transaction.findOne({ _id: req.params.id, user: req.user._id, deletedAt: null });
  if (!transaction) throw ApiError.notFound('Transaction not found.');

  const before = {
    amount: transaction.amount,
    description: transaction.description,
    note: transaction.note,
    date: transaction.date,
    category: transaction.category,
    type: transaction.type
  };

  const { type, amount, category, description, note, date, paymentMethod, isRecurring, recurrence } = req.body;
  const nextType = type || transaction.type;
  if (category || type) {
    await assertOwnedCategory(req.user._id, category || transaction.category, nextType);
  }

  if (nextType === 'expense') {
    const val = amount !== undefined ? Number(amount) : transaction.amount;
    const { rawAvailable } = await analytics.getAvailableBalance(req.user._id, transaction._id);
    if (val > rawAvailable || rawAvailable <= 0) {
      throw ApiError.badRequest(
        `Cannot update expense: Rs ${analytics.round(val)} exceeds your available balance of Rs ${Math.max(0, rawAvailable)}. Balance cannot be negative!`
      );
    }
  }

  if (type) transaction.type = nextType;
  if (amount !== undefined) {
    const value = Number(amount);
    if (!value || value <= 0) throw ApiError.badRequest('Enter an amount greater than zero.');
    transaction.amount = analytics.round(value);
  }
  if (category) transaction.category = category;
  if (paymentMethod !== undefined) {
    if (!['cash', 'card', 'digital_wallet'].includes(paymentMethod)) throw ApiError.badRequest('Choose a valid payment method.');
    transaction.paymentMethod = paymentMethod;
  }
  if (description !== undefined) transaction.description = String(description).trim();
  if (note !== undefined) transaction.note = String(note).trim();
  if (date) {
    const when = new Date(date);
    if (Number.isNaN(when.getTime())) throw ApiError.badRequest('That date is not valid.');
    const whenDay = new Date(when);
    whenDay.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (whenDay > today) throw ApiError.badRequest('Future dates cannot be selected.');
    transaction.date = when;
  }

  const expenseBudgetChanged = nextType === 'expense' && (
    before.type !== 'expense' ||
    String(transaction.category) !== String(before.category) ||
    monthKey(transaction.date) !== monthKey(before.date)
  );
  if (expenseBudgetChanged) {
    const categoryDoc = await Category.findById(transaction.category).select('name').lean();
    await requireExpenseBudget(
      req.user._id,
      transaction.category,
      monthKey(transaction.date),
      categoryDoc?.name || 'this category'
    );
  }

  if (isRecurring !== undefined) {
    if (isRecurring) {
      const frequency = ['weekly', 'yearly'].includes(recurrence?.frequency) ? recurrence.frequency : 'monthly';
      transaction.isRecurring = true;
      transaction.recurrence = {
        frequency,
        nextRunOn: transaction.recurrence?.nextRunOn || firstRunDate(transaction.date, frequency),
        endsOn: recurrence?.endsOn ? new Date(recurrence.endsOn) : null,
        active: recurrence?.active !== false
      };
    } else {
      transaction.isRecurring = false;
      transaction.recurrence = null;
    }
  }

  await transaction.save();

  // Recompute the mirrored savings balance from the updated live transactions.
  // This keeps amount/type/category edits consistent with create, delete, and restore.
  await analytics.syncSavingsToAvailableBalance(req.user._id);

  const changes = Object.keys(before).filter(
    (key) => String(before[key]) !== String(transaction[key])
  );

  if (transaction.description && changes.includes('category')) {
    await categorizer.learnFromTransaction(req.user._id, transaction.description, transaction.category, before.category);
  }
  await analytics.refreshAnomalyFlags(req.user._id);
  const budgetAlerts = nextType === 'expense'
    ? await checkBudgetAlerts(req.user, monthKey(transaction.date))
    : [];
  const warnings = nextType === 'expense'
    ? await getBudgetWarnings(req.user, monthKey(transaction.date), transaction.category)
    : [];
  budgetAlerts.forEach((alert) => {
    if (!warnings.some((warning) => warning.type === 'budget_exceeded')) {
      warnings.push({ type: 'budget_alert', level: alert.level, message: `${alert.title}. ${alert.body}` });
    }
  });

  await log(req.user._id, transaction._id, 'updated', changes, { before, after: { ...transaction.toObject() } });

  const saved = await Transaction.findById(transaction._id).populate('category', 'name color icon type');
  res.json({
    transaction: saved,
    changes,
    alerts: budgetAlerts.length,
    warnings
  });
}

/** DELETE /api/transactions/:id — soft delete, so the history stays intact. */
async function deleteTransaction(req, res) {
  const transaction = await Transaction.findOne({ _id: req.params.id, user: req.user._id, deletedAt: null });
  if (!transaction) throw ApiError.notFound('Transaction not found.');

  transaction.deletedAt = new Date();
  if (transaction.isRecurring && transaction.recurrence) transaction.recurrence.active = false;
  await transaction.save();
  await analytics.syncSavingsToAvailableBalance(req.user._id);

  await log(req.user._id, transaction._id, 'deleted', [], {
    amount: transaction.amount,
    description: transaction.description,
    date: transaction.date
  });
  await analytics.refreshAnomalyFlags(req.user._id);

  res.json({ message: 'Transaction deleted. You can restore it from the history panel.' });
}

/** POST /api/transactions/:id/restore */
async function restoreTransaction(req, res) {
  const transaction = await Transaction.findOne({ _id: req.params.id, user: req.user._id });
  if (!transaction || !transaction.deletedAt) throw ApiError.notFound('Nothing to restore.');

  transaction.deletedAt = null;
  await transaction.save();
  await analytics.syncSavingsToAvailableBalance(req.user._id);
  await log(req.user._id, transaction._id, 'restored');
  await analytics.refreshAnomalyFlags(req.user._id);

  res.json({ message: 'Transaction restored.' });
}

/** GET /api/transactions/deleted — the recycle bin behind "retaining the full history". */
async function listDeleted(req, res) {
  const items = await Transaction.find({ user: req.user._id, deletedAt: { $ne: null } })
    .populate('category', 'name color icon')
    .sort({ deletedAt: -1 })
    .limit(50)
    .lean();
  res.json({ items });
}

/** GET /api/transactions/:id/history — the audit trail for one row. */
async function transactionHistory(req, res) {
  const logs = await ActivityLog.find({ user: req.user._id, transaction: req.params.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ logs });
}

/** GET /api/transactions/recurring — the rules, not the generated entries. */
async function listRecurring(req, res) {
  const items = await Transaction.find({ user: req.user._id, isRecurring: true, deletedAt: null })
    .populate('category', 'name color icon')
    .sort({ 'recurrence.nextRunOn': 1 })
    .lean();
  res.json({ items });
}

/** POST /api/transactions/suggest — live category suggestion while typing. */
async function suggest(req, res) {
  if (!req.user.preferences?.assistantEnabled) return res.json({ suggestion: null, disabled: true });

  const { description, type = 'expense' } = req.body;
  const suggestion = await categorizer.suggestCategory(req.user._id, description, type);
  res.json({ suggestion });
}

module.exports = {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  listDeleted,
  transactionHistory,
  listRecurring,
  suggest
};
