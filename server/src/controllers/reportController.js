const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const User = require('../models/User');
const analytics = require('../services/analytics');
const tipsService = require('../services/tips');
const Insight = require('../models/Insight');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const { sendMail } = require('../utils/mailer');
const { runDueRecurring } = require('../services/recurring');
const { monthKey, monthStart, monthEnd, monthLabel, shiftMonth } = require('../utils/dates');

function reportDate(value, endOfDay = false) {
  const text = String(value);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const date = isDateOnly
    ? new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    : new Date(text);
  if (!Number.isFinite(date.getTime())) throw ApiError.badRequest('Choose a valid report date.');
  if (!isDateOnly) {
    if (endOfDay) date.setHours(23, 59, 59, 999);
    else date.setHours(0, 0, 0, 0);
  }
  return date;
}

/**
 * GET /api/dashboard
 * One round trip for everything above the fold: balance, widgets, tips,
 * insight, recent rows, announcements.
 */
async function dashboard(req, res) {
  const month = req.query.month || monthKey();
  await runDueRecurring(req.user._id);
  await analytics.syncSavingsToAvailableBalance(req.user._id);

  const user = await User.findById(req.user._id).lean();
  const { available: spendableBalance } = await analytics.getAvailableBalance(req.user._id);

  const [totals, previous, breakdown, trend6, budgets, recent, insight, announcements, unread] =
    await Promise.all([
      analytics.monthTotals(req.user._id, month),
      analytics.monthTotals(req.user._id, shiftMonth(month, -1)),
      analytics.categoryBreakdown(req.user._id, {
        from: monthStart(month),
        to: monthEnd(month),
        type: 'expense'
      }),
      analytics.incomeVsExpense(req.user._id, 6, month),
      analytics.budgetProgress(req.user._id, month),
      Transaction.find({ user: req.user._id, deletedAt: null })
        .populate('category', 'name color icon')
        .sort({ date: -1, createdAt: -1 })
        .limit(6)
        .lean(),
      Insight.findOne({ user: req.user._id, month }).lean(),
      Announcement.find({ kind: 'announcement', active: true }).sort({ createdAt: -1 }).limit(3).lean(),
      Notification.countDocuments({ user: req.user._id, read: false })
    ]);

  const tips = await tipsService.generateTips(req.user, month);

  const spentChange =
    previous.expense > 0
      ? analytics.round(((totals.expense - previous.expense) / previous.expense) * 100)
      : null;

  const savingsGoal = user?.savingsGoal || req.user.savingsGoal || 0;
  const monthlyAllowance = user?.monthlyAllowance || req.user.monthlyAllowance || 0;

  // If no income transactions but allowance is set, include it in balance/income display
  let displayTotals = { ...totals };
  if (totals.income === 0 && monthlyAllowance > 0) {
    displayTotals = {
      ...totals,
      income: analytics.round(monthlyAllowance),
      balance: analytics.round(monthlyAllowance - totals.expense)
    };
  }

  // Alerts for dashboard
  const dashboardAlerts = [];
  if (displayTotals.income > 0 && totals.expense > displayTotals.income) {
    dashboardAlerts.push({
      type: 'expense_limit',
      level: 'danger',
      message: "You have reached your expense limit (don't go for saving). Your expenses exceed your income."
    });
  } else if (displayTotals.balance < 0 && totals.expense > 0) {
    dashboardAlerts.push({
      type: 'using_savings',
      level: 'danger',
      message: "You have reached your expense limit (don't go for saving). You are using your savings to cover expenses."
    });
  } else if (displayTotals.balance === 0 && totals.expense > 0 && (displayTotals.income > 0 || monthlyAllowance > 0)) {
    dashboardAlerts.push({
      type: 'using_savings',
      level: 'danger',
      message: "You have reached your expense limit (don't go for saving). Your balance is zero - avoid going further as it will use savings."
    });
  } else if (savingsGoal > 0 && displayTotals.balance > 0 && displayTotals.balance < savingsGoal && totals.expense > 0) {
    // Check if balance is going below savings goal
    dashboardAlerts.push({
      type: 'savings_warning',
      level: 'warn',
      message: `Try to control your budget, don't use your savings. You have only ${displayTotals.balance} left, which is below your savings goal of ${savingsGoal}.`
    });
  } else if (savingsGoal > 0 && displayTotals.balance > 0 && displayTotals.balance <= savingsGoal + 500 && totals.expense > 0) {
    // Warn when getting close to savings goal
    const freeAfterSavings = displayTotals.balance - savingsGoal;
    if (freeAfterSavings >= 0 && freeAfterSavings <= 200) {
      dashboardAlerts.push({
        type: 'savings_warning',
        level: 'warn',
        message: `Only ${freeAfterSavings} left after your savings goal of ${savingsGoal}. Try to control your budget, don't use your savings.`
      });
    }
  }

  res.json({
    month,
    monthLabel: monthLabel(month),
    greetingName: req.user.name,
    totals: {
      ...displayTotals,
      spendableBalance,
      allowance: analytics.round(monthlyAllowance),
      totalAvailable: analytics.round((displayTotals.income || totals.income) + monthlyAllowance)
    },
    previousTotals: previous,
    spentChange,
    topCategory: breakdown[0] || null,
    breakdown: breakdown.slice(0, 8),
    trend: trend6,
    budgets: budgets.slice(0, 5),
    budgetSummary: {
      tracked: budgets.length,
      overBudget: budgets.filter((b) => b.state === 'over').length,
      nearLimit: budgets.filter((b) => b.state === 'near').length
    },
    savings: {
      goal: savingsGoal,
      balance: user?.currentSavings || 0,
      achieved: displayTotals.balance,
      percent: savingsGoal ? analytics.round(Math.min(100, (displayTotals.balance / savingsGoal) * 100)) : null
    },
    tips: tips.slice(0, 3),
    insight,
    recent,
    announcements,
    unreadNotifications: unread,
    alerts: dashboardAlerts
  });
}

/**
 * GET /api/reports
 * Everything the reports page needs, honouring the date-range, category,
 * income source, and transaction source filters from the query string.
 */
async function reports(req, res) {
  const month = req.query.month || (req.query.from ? monthKey(new Date(req.query.from)) : monthKey());
  const from = req.query.from ? reportDate(req.query.from) : monthStart(month);
  const to = req.query.to
    ? reportDate(req.query.to, true)
    : new Date(new Date(monthEnd(month)).getTime() - 1);

  let categoryIds = null;
  if (req.query.categories) {
    categoryIds = String(req.query.categories).split(',').filter(Boolean);
  } else if (req.query.category) {
    categoryIds = [req.query.category];
  }

  let incomeCategoryIds = null;
  if (req.query.incomeSource) {
    if (mongoose.Types.ObjectId.isValid(req.query.incomeSource)) {
      incomeCategoryIds = [req.query.incomeSource];
    } else {
      const cat = await Category.findOne({
        name: req.query.incomeSource,
        type: 'income',
        $or: [{ owner: req.user._id }, { isDefault: true }]
      }).lean();
      if (cat) incomeCategoryIds = [String(cat._id)];
    }
  }

  const source = req.query.source || null;

  // Determine if categoryIds contains expense or income categories
  let expenseCategoryIds = categoryIds;
  if (categoryIds && categoryIds.length) {
    const cats = await Category.find({ _id: { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) } }).lean();
    const hasExpense = cats.some((c) => c.type === 'expense');
    const hasIncome = cats.some((c) => c.type === 'income');
    if (!hasExpense && hasIncome) {
      expenseCategoryIds = [];
      if (!incomeCategoryIds) {
        incomeCategoryIds = categoryIds;
      }
    }
  }

  let expenseMatch = {
    user: req.user._id,
    deletedAt: null,
    type: 'expense',
    // Scanned receipts are saved for reference only and must not be included
    // in report totals unless the caller explicitly filters to that source.
    source: source || { $ne: 'receipt_scan' },
    date: { $gte: from, $lte: to }
  };

  let incomeMatch = {
    user: req.user._id,
    deletedAt: null,
    type: 'income',
    source: source || { $ne: 'receipt_scan' },
    date: { $gte: from, $lte: to }
  };

  if (source) {
    expenseMatch.source = source;
    incomeMatch.source = source;
  }

  if (incomeCategoryIds?.length) {
    incomeMatch.category = { $in: incomeCategoryIds.map((id) => new mongoose.Types.ObjectId(id)) };
    if (!categoryIds?.length || expenseCategoryIds?.length === 0) {
      expenseMatch = null;
    }
  }

  if (categoryIds?.length) {
    if (expenseCategoryIds?.length) {
      expenseMatch.category = { $in: expenseCategoryIds.map((id) => new mongoose.Types.ObjectId(id)) };
      if (!incomeCategoryIds?.length) {
        incomeMatch = null;
      }
    } else {
      expenseMatch = null;
    }
  }

  const [expenseByCategory, incomeByCategory, trend, daily, weekly, budgets, totals] = await Promise.all([
    expenseMatch
      ? analytics.categoryBreakdown(req.user._id, { from, to, type: 'expense', categoryIds: expenseCategoryIds, source })
      : Promise.resolve([]),
    incomeMatch
      ? analytics.categoryBreakdown(req.user._id, { from, to, type: 'income', categoryIds: incomeCategoryIds, source })
      : Promise.resolve([]),
    analytics.incomeVsExpense(req.user._id, 6, month, { source }),
    expenseMatch
      ? analytics.dailySummary(req.user._id, month, { categoryIds: expenseCategoryIds, source })
      : Promise.resolve([]),
    expenseMatch
      ? analytics.weeklySummary(req.user._id, month, { categoryIds: expenseCategoryIds, source })
      : Promise.resolve([]),
    analytics.budgetProgress(req.user._id, month),
    analytics.monthTotals(req.user._id, month)
  ]);

  const expenseEntryMatch = expenseMatch ? { ...expenseMatch } : null;
  const incomeEntryMatch = incomeMatch ? { ...incomeMatch } : null;
  // Receipt scans remain visible as saved entries, while their amounts stay
  // excluded from financial report totals.
  if (!source) {
    if (expenseEntryMatch) delete expenseEntryMatch.source;
    if (incomeEntryMatch) delete incomeEntryMatch.source;
  }

  const [expenseRows, incomeRows, expenseEntryCount, incomeEntryCount] = await Promise.all([
    expenseMatch
      ? Transaction.aggregate([
        { $match: expenseMatch },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ])
      : Promise.resolve([]),
    incomeMatch
      ? Transaction.aggregate([
        { $match: incomeMatch },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ])
      : Promise.resolve([]),
    expenseEntryMatch ? Transaction.countDocuments(expenseEntryMatch) : Promise.resolve(0),
    incomeEntryMatch ? Transaction.countDocuments(incomeEntryMatch) : Promise.resolve(0)
  ]);

  const rangeExpense = expenseRows[0] || { total: 0, count: 0 };
  const rangeIncome = incomeRows[0] || { total: 0, count: 0 };
  const isWholeMonth =
    from.getTime() === monthStart(month).getTime() &&
    to.getTime() === monthEnd(month).getTime() - 1;
  let reportedIncome = rangeIncome.total;
  if (
    isWholeMonth &&
    !rangeIncome.count &&
    !categoryIds?.length &&
    !incomeCategoryIds?.length &&
    !source &&
    req.user.monthlyAllowance > 0
  ) {
    // Match the dashboard's allowance fallback without treating it as a
    // transaction entry or adding it to category-level recorded income.
    reportedIncome = req.user.monthlyAllowance;
  }

  const rangeTotals = {
    income: analytics.round(reportedIncome),
    expense: analytics.round(rangeExpense.total),
    balance: analytics.round(reportedIncome - rangeExpense.total),
    count: incomeEntryCount + expenseEntryCount,
    incomeCount: incomeEntryCount,
    expenseCount: expenseEntryCount
  };

  res.json({
    month,
    monthLabel: monthLabel(month),
    range: { from, to },
    rangeTotals,
    monthTotals: totals,
    expenseByCategory,
    incomeByCategory,
    trend,
    daily,
    weekly,
    budgets
  });
}

/** GET /api/reports/forecast */
async function forecast(req, res) {
  const data = await analytics.forecastNextMonth(req.user._id, req.query.month || monthKey());
  res.json(data);
}

/** GET /api/reports/anomalies */
async function anomalies(req, res) {
  const data = await analytics.detectAnomalies(req.user._id);
  res.json(data);
}

/**
 * POST /api/reports/share — emails a plain-text monthly summary.
 * Falls back to printing on the server when SMTP is not configured, and says so.
 */
async function shareReport(req, res) {
  const { month = monthKey(), message = '' } = req.body;
  const to = req.body.to || req.user.email;
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) throw ApiError.badRequest('Your account does not have a valid email address.');

  const [totals, breakdown, insight] = await Promise.all([
    analytics.monthTotals(req.user._id, month),
    analytics.categoryBreakdown(req.user._id, {
      from: monthStart(month),
      to: monthEnd(month),
      type: 'expense'
    }),
    Insight.findOne({ user: req.user._id, month }).lean()
  ]);

  const currency = req.user.preferences?.currency === 'USD' ? '$' : `${req.user.preferences?.currency || ''} `;
  const lines = [
    `Spendify — ${monthLabel(month)}`,
    `Shared by ${req.user.name}`,
    '',
    `Income   : ${currency}${totals.income}`,
    `Expenses : ${currency}${totals.expense}`,
    `Balance  : ${currency}${totals.balance}`,
    `Entries  : ${totals.transactionCount}`,
    ''
  ];

  if (breakdown.length) {
    lines.push('Spending by category');
    for (const row of breakdown) {
      lines.push(`  ${row.name.padEnd(16)} ${currency}${row.total}  (${row.share}%)`);
    }
    lines.push('');
  }

  if (insight?.summaryText) {
    lines.push('Summary', insight.summaryText, '');
    if (insight.tipText) lines.push('Suggestion', insight.tipText, '');
  }

  if (message.trim()) lines.push('Note from sender', message.trim(), '');
  lines.push('— Sent from Spendify');

  const { delivered } = await sendMail({
    to,
    subject: `Spendify summary — ${monthLabel(month)}`,
    text: lines.join('\n')
  });

  res.json({
    message: delivered
      ? `Summary sent to ${to}.`
      : 'Mail is not configured on this server, so the summary was written to the server console instead.',
    delivered
  });
}

module.exports = { dashboard, reports, forecast, anomalies, shareReport };
