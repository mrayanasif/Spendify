const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const User = require('../models/User');
const {
  monthKey, monthStart, monthEnd, shiftMonth, lastMonths,
  shortMonthLabel, daysInMonth, weekOfMonth, toISODate, addDays
} = require('../utils/dates');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** Every aggregation starts from live (not soft-deleted) rows for one student. */
function baseMatch(userId, extra = {}) {
  const { source, ...conditions } = extra;
  const and = [...(conditions.$and || []), { source: { $ne: 'receipt_scan' } }];
  if (source !== undefined) and.push({ source });
  return { user: oid(userId), deletedAt: null, ...conditions, $and: and };
}

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Calculates current available balance for a user:
 * Total Income (or monthly allowance if no income) minus Total Expenses.
 */
async function getAvailableBalance(userId, excludeTransactionId = null) {
  const user = await User.findById(userId).lean();
  const filter = { user: oid(userId), deletedAt: null, source: { $ne: 'receipt_scan' } };
  if (excludeTransactionId) {
    filter._id = { $ne: oid(excludeTransactionId) };
  }
  const sums = await Transaction.aggregate([
    { $match: filter },
    { $group: { _id: '$type', total: { $sum: '$amount' } } }
  ]);
  const incomeSum = sums.find((s) => s._id === 'income')?.total || 0;
  const expenseSum = sums.find((s) => s._id === 'expense')?.total || 0;

  let totalIncome = incomeSum;
  // If no income transaction exists yet, use the monthly allowance set at signup/profile
  if (totalIncome === 0 && (user?.monthlyAllowance || 0) > 0) {
    totalIncome = user.monthlyAllowance;
  }

  // Savings mirrors the remaining balance; it is displayed twice but counted once.
  const rawAvailable = round(totalIncome - expenseSum);
  return {
    available: Math.max(0, rawAvailable),
    rawAvailable,
    totalIncome: round(totalIncome),
    totalExpense: round(expenseSum),
    recordedIncome: round(incomeSum)
  };
}

/** Move any existing positive spendable balance into the separate savings balance. */
async function syncSavingsToAvailableBalance(userId) {
  const [{ rawAvailable }, user] = await Promise.all([
    getAvailableBalance(userId),
    User.findById(userId).select('currentSavings').lean()
  ]);
  const target = round(Math.max(0, rawAvailable));
  if (!user || user.currentSavings === target) {
    return { amount: 0, currentSavings: user?.currentSavings || 0 };
  }

  const updated = await User.findOneAndUpdate(
    { _id: userId, currentSavings: user.currentSavings },
    { $set: { currentSavings: target } },
    { new: true }
  ).select('currentSavings').lean();
  const latest = updated || await User.findById(userId).select('currentSavings').lean();
  return {
    amount: updated ? round(target - user.currentSavings) : 0,
    currentSavings: latest?.currentSavings || 0
  };
}

async function syncTransactionSavings(userId, transaction) {
  const result = await syncSavingsToAvailableBalance(userId);
  if (result.amount < 0) {
    transaction.deductedFromSavings = true;
    transaction.savingsDeductedAmount = Math.abs(result.amount);
    transaction.savingsAddedAmount = 0;
  } else if (result.amount > 0) {
    transaction.deductedFromSavings = false;
    transaction.savingsDeductedAmount = 0;
    transaction.savingsAddedAmount = result.amount;
  }
  if (result.amount !== 0) await transaction.save();
  return result;
}

/* ------------------------------------------------------------------ totals */

/** Income, expense and balance for one `YYYY-MM`. */
async function monthTotals(userId, month) {
  const monthDateRange = { $gte: monthStart(month), $lt: monthEnd(month) };
  const [rows, entryCounts] = await Promise.all([
    Transaction.aggregate([
      { $match: baseMatch(userId, { date: monthDateRange }) },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Transaction.aggregate([
      { $match: { user: oid(userId), deletedAt: null, date: monthDateRange } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ])
  ]);

  const income = rows.find((r) => r._id === 'income');
  const expense = rows.find((r) => r._id === 'expense');
  const incomeEntries = entryCounts.find((r) => r._id === 'income')?.count || 0;
  const expenseEntries = entryCounts.find((r) => r._id === 'expense')?.count || 0;

  return {
    month,
    income: round(income?.total || 0),
    expense: round(expense?.total || 0),
    balance: round((income?.total || 0) - (expense?.total || 0)),
    incomeCount: income?.count || 0,
    expenseCount: expense?.count || 0,
    transactionCount: (income?.count || 0) + (expense?.count || 0),
    incomeEntryCount: incomeEntries,
    expenseEntryCount: expenseEntries,
    entryCount: incomeEntries + expenseEntries
  };
}

/* ------------------------------------------------- category-wise breakdown */

/**
 * Spending (or income) per category for a date window.
 * Returns rows sorted high to low with each one's share of the total.
 */
async function categoryBreakdown(userId, { from, to, type = 'expense', categoryIds = null, source = null }) {
  const match = baseMatch(userId, { type, date: { $gte: from, $lte: to } });
  if (categoryIds?.length) match.category = { $in: categoryIds.map(oid) };
  if (source) match.source = source;

  const entryMatch = { user: oid(userId), deletedAt: null, type, date: { $gte: from, $lte: to } };
  if (categoryIds?.length) entryMatch.category = { $in: categoryIds.map(oid) };
  if (source) entryMatch.source = source;

  const [rows, entryRows] = await Promise.all([
    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          largest: { $max: '$amount' }
        }
      },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      { $sort: { total: -1 } }
    ]),
    Transaction.aggregate([
      { $match: entryMatch },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ])
  ]);

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const entryCounts = new Map(entryRows.map((row) => [String(row._id), row.count]));

  return rows.map((r) => ({
    categoryId: r._id,
    name: r.category.name,
    color: r.category.color,
    icon: r.category.icon,
    total: round(r.total),
    count: entryCounts.get(String(r._id)) || 0,
    financialCount: r.count,
    largest: round(r.largest),
    share: grandTotal ? round((r.total / grandTotal) * 100) : 0
  }));
}

/* -------------------------------------------- income vs expense (6 months) */

/** One row per month for the trend chart. */
async function incomeVsExpense(userId, months = 6, endMonth = monthKey(), { categoryIds = null, source = null } = {}) {
  const keys = lastMonths(months, endMonth);
  const match = baseMatch(userId, {
    date: { $gte: monthStart(keys[0]), $lt: monthEnd(keys[keys.length - 1]) }
  });
  if (categoryIds?.length) match.category = { $in: categoryIds.map(oid) };
  if (source) match.source = source;

  const rows = await Transaction.aggregate([
    {
      $match: match
    },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$type' },
        total: { $sum: '$amount' }
      }
    }
  ]);

  const lookup = new Map(rows.map((r) => [`${r._id.month}:${r._id.type}`, r.total]));

  return keys.map((key) => {
    const income = round(lookup.get(`${key}:income`) || 0);
    const expense = round(lookup.get(`${key}:expense`) || 0);
    return { month: key, label: shortMonthLabel(key), income, expense, balance: round(income - expense) };
  });
}

/* ------------------------------------------------ daily / weekly summaries */

/** Spending per calendar day of a month, zero-filled so the chart has no gaps. */
async function dailySummary(userId, month, { categoryIds = null, source = null } = {}) {
  const dateRange = { $gte: monthStart(month), $lt: monthEnd(month) };
  const match = baseMatch(userId, {
    type: 'expense',
    date: dateRange
  });
  if (categoryIds?.length) match.category = { $in: categoryIds.map(oid) };
  if (source) match.source = source;

  const entryMatch = { user: oid(userId), deletedAt: null, type: 'expense', date: dateRange };
  if (categoryIds?.length) entryMatch.category = { $in: categoryIds.map(oid) };
  if (source) entryMatch.source = source;

  const [rows, entryRows] = await Promise.all([
    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dayOfMonth: '$date' },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]),
    Transaction.aggregate([
      { $match: entryMatch },
      { $group: { _id: { $dayOfMonth: '$date' }, count: { $sum: 1 } } }
    ])
  ]);

  const lookup = new Map(rows.map((r) => [r._id, r]));
  const entryLookup = new Map(entryRows.map((r) => [r._id, r.count]));
  const total = daysInMonth(month);

  return Array.from({ length: total }, (_, i) => {
    const day = i + 1;
    const hit = lookup.get(day);
    return {
      day,
      label: String(day),
      total: round(hit?.total || 0),
      count: entryLookup.get(day) || 0,
      financialCount: hit?.count || 0
    };
  });
}

/** Cumulative daily expenses for categories with a budget in this month. */
async function budgetDailySummary(userId, month, categoryIds) {
  if (!categoryIds.length) return [];

  const from = monthStart(month);
  const to = monthEnd(month);
  const rows = await Transaction.aggregate([
    {
      $match: {
        user: oid(userId),
        deletedAt: null,
        type: 'expense',
        category: { $in: categoryIds.map(oid) },
        $or: [
          { source: { $ne: 'receipt_scan' }, date: { $gte: from, $lt: to } },
          { source: 'receipt_scan', createdAt: { $gte: from, $lt: to } }
        ]
      }
    },
    {
      $group: {
        _id: {
          $dayOfMonth: {
            $cond: [{ $eq: ['$source', 'receipt_scan'] }, '$createdAt', '$date']
          }
        },
        total: { $sum: '$amount' }
      }
    }
  ]);

  const lookup = new Map(rows.map((row) => [row._id, row.total]));
  let cumulative = 0;

  return Array.from({ length: daysInMonth(month) }, (_, index) => {
    const day = index + 1;
    cumulative = round(cumulative + (lookup.get(day) || 0));
    return { day, label: String(day), cumulative };
  });
}

/** Rolls the daily figures into calendar weeks 1-5 of the month. */
async function weeklySummary(userId, month, options = {}) {
  const days = await dailySummary(userId, month, options);
  const buckets = new Map();

  for (const entry of days) {
    const week = Math.floor((entry.day - 1) / 7) + 1;
    const bucket = buckets.get(week) || { week, total: 0, count: 0, days: [] };
    bucket.total += entry.total;
    bucket.count += entry.count;
    bucket.days.push(entry.day);
    buckets.set(week, bucket);
  }

  return [...buckets.values()]
    .sort((a, b) => a.week - b.week)
    .map((b) => ({
      week: b.week,
      label: `Week ${b.week}`,
      range: `${b.days[0]}-${b.days[b.days.length - 1]}`,
      total: round(b.total),
      count: b.count,
      dailyAverage: round(b.total / b.days.length)
    }));
}

/* ------------------------------------------------------ budget vs. actual */

/** Pairs each budget for a month with what was actually spent against it. */
async function budgetProgress(userId, month) {
  const budgets = await Budget.find({ user: userId, month })
    .populate('category', 'name color icon type')
    .lean();

  if (!budgets.length) return [];

  const from = monthStart(month);
  const to = monthEnd(month);
  const spend = await Transaction.aggregate([
    {
      $match: {
        user: oid(userId),
        deletedAt: null,
        type: 'expense',
        $or: [
          { source: { $ne: 'receipt_scan' }, date: { $gte: from, $lt: to } },
          { source: 'receipt_scan', createdAt: { $gte: from, $lt: to } }
        ]
      }
    },
    { $group: { _id: '$category', total: { $sum: '$amount' } } }
  ]);

  const spentBy = new Map(spend.map((s) => [s._id.toString(), s.total]));

  return budgets
    .filter((b) => b.category)
    .map((b) => {
      const spent = round(spentBy.get(b.category._id.toString()) || 0);
      const percent = b.limitAmount ? round((spent / b.limitAmount) * 100) : 0;
      return {
        budgetId: b._id,
        categoryId: b.category._id,
        name: b.category.name,
        color: b.category.color,
        icon: b.category.icon,
        limitAmount: round(b.limitAmount),
        spent,
        remaining: round(b.limitAmount - spent),
        percent,
        state: percent >= 100 ? 'over' : percent >= 80 ? 'near' : 'ok'
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

/* ----------------------------------------------------- forecast next month */

/**
 * Projects next month's spend per category.
 *
 * Takes the last three months, uses their mean as the base and half of the
 * month-over-month slope as a trend nudge. Three points is little data, so the
 * result is presented as an estimate and the slope is deliberately damped.
 */
async function forecastNextMonth(userId, fromMonth = monthKey()) {
  const keys = lastMonths(3, fromMonth);

  const rows = await Transaction.aggregate([
    {
      $match: baseMatch(userId, {
        type: 'expense',
        date: { $gte: monthStart(keys[0]), $lt: monthEnd(keys[keys.length - 1]) }
      })
    },
    {
      $group: {
        _id: {
          category: '$category',
          month: { $dateToString: { format: '%Y-%m', date: '$date' } }
        },
        total: { $sum: '$amount' }
      }
    },
    { $lookup: { from: 'categories', localField: '_id.category', foreignField: '_id', as: 'category' } },
    { $unwind: '$category' }
  ]);

  const perCategory = new Map();
  for (const row of rows) {
    const id = row._id.category.toString();
    const entry = perCategory.get(id) || { category: row.category, months: new Map() };
    entry.months.set(row._id.month, row.total);
    perCategory.set(id, entry);
  }

  const projections = [];
  for (const [id, entry] of perCategory) {
    const series = keys.map((k) => entry.months.get(k) || 0);
    const observed = series.filter((v) => v > 0);
    if (!observed.length) continue;

    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    const slope = (series[series.length - 1] - series[0]) / (series.length - 1 || 1);
    const projected = Math.max(0, mean + slope * 0.5);

    projections.push({
      categoryId: id,
      name: entry.category.name,
      color: entry.category.color,
      icon: entry.category.icon,
      history: keys.map((k, i) => ({ month: k, label: shortMonthLabel(k), total: round(series[i]) })),
      average: round(mean),
      projected: round(projected),
      direction: slope > mean * 0.05 ? 'up' : slope < -mean * 0.05 ? 'down' : 'flat'
    });
  }

  projections.sort((a, b) => b.projected - a.projected);

  return {
    month: shiftMonth(fromMonth, 1),
    basedOn: keys,
    total: round(projections.reduce((sum, p) => sum + p.projected, 0)),
    categories: projections,
    confidence: projections.length >= 3 ? 'moderate' : 'low'
  };
}

/* ------------------------------------------------------ anomaly detection */

/**
 * Flags two things the SRS asks for:
 *   - unusually large amounts (above mean + 2 standard deviations for that
 *     category, and at least 1.5x the mean, so a tiny spread cannot trip it)
 *   - probable duplicates (same category and amount within three days, with a
 *     similar description)
 * Returns the flags; the caller decides whether to persist or just warn.
 */
async function detectAnomalies(userId, { lookbackDays = 90 } = {}) {
  const since = addDays(new Date(), -lookbackDays);

  const transactions = await Transaction.find(
    { user: oid(userId), deletedAt: null, type: 'expense', date: { $gte: since } }
  )
    .populate('category', 'name color')
    .sort({ date: -1 })
    .lean();

  // --- per-category statistics
  const stats = new Map();
  for (const t of transactions) {
    const id = t.category?._id?.toString() || 'none';
    const bucket = stats.get(id) || [];
    bucket.push(t.amount);
    stats.set(id, bucket);
  }

  const thresholds = new Map();
  for (const [id, amounts] of stats) {
    if (amounts.length < 4) continue;
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, v) => sum + (v - mean) ** 2, 0) / amounts.length;
    const sd = Math.sqrt(variance);
    thresholds.set(id, { mean, threshold: Math.max(mean + 2 * sd, mean * 1.5) });
  }

  const [account, incomeRows] = await Promise.all([
    User.findById(userId).select('monthlyAllowance').lean(),
    Transaction.aggregate([
      { $match: { user: oid(userId), deletedAt: null, type: 'income', date: { $gte: addDays(new Date(), -30) } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);
  const recentIncome = incomeRows[0]?.total || 0;
  const largeSpendThreshold = recentIncome > 0
    ? Math.max(1, recentIncome * 0.5)
    : account?.monthlyAllowance > 0 ? account.monthlyAllowance * 2 : 50000;

  const large = [];
  for (const t of transactions) {
    const id = t.category?._id?.toString() || 'none';
    const stat = thresholds.get(id);
    const statisticallyLarge = stat && t.amount > stat.threshold;
    if (!statisticallyLarge && t.amount < largeSpendThreshold) continue;
    large.push({
      id: t._id,
      description: t.description || t.category?.name,
      category: t.category?.name,
      color: t.category?.color,
      amount: round(t.amount),
      date: t.date,
      categoryAverage: round(stat?.mean || 0),
      timesAverage: round(t.amount / (stat?.mean || 1))
    });
  }

  // --- duplicates: same category + amount, three days apart or less
  const duplicates = [];
  const seen = new Map();
  const duplicateClusters = new Set();
  for (const t of [...transactions].sort((a, b) => a.date - b.date)) {
    const key = `${t.category?._id}:${t.amount.toFixed(2)}`;
    const previous = seen.get(key);
    const gapDays = previous ? Math.abs(new Date(t.date) - new Date(previous.transaction.date)) / 86400000 : Infinity;
    const cluster = previous && gapDays <= 3
      ? previous.cluster
      : { duplicate: false };
    if (previous && gapDays <= 3) {
      const sameText =
        (t.description || '').trim().toLowerCase() === (previous.transaction.description || '').trim().toLowerCase();
      if (sameText || !t.description) {
        cluster.duplicate = true;
        duplicates.push({
          id: t._id,
          pairedWith: previous.transaction._id,
          description: t.description || t.category?.name,
          category: t.category?.name,
          color: t.category?.color,
          amount: round(t.amount),
          date: t.date,
          previousDate: previous.transaction.date,
          gapDays: Math.round(gapDays)
        });
      }
    }
    if (cluster.duplicate) duplicateClusters.add(cluster);
    seen.set(key, { transaction: t, cluster });
  }

  return {
    large: large.slice(0, 12),
    duplicates: duplicates.slice(0, 12),
    largeCount: large.length,
    duplicateCount: duplicateClusters.size
  };
}

/** Writes the anomaly flags back onto the transactions so lists can badge them. */
async function refreshAnomalyFlags(userId) {
  const { large, duplicates } = await detectAnomalies(userId);
  const largeIds = large.map((l) => l.id);
  const duplicateIds = duplicates.map((d) => d.id);

  await Transaction.updateMany(
    { user: userId, deletedAt: null },
    { $set: { 'flags.unusuallyLarge': false, 'flags.possibleDuplicate': false } }
  );
  if (largeIds.length) {
    await Transaction.updateMany({ _id: { $in: largeIds } }, { $set: { 'flags.unusuallyLarge': true } });
  }
  if (duplicateIds.length) {
    await Transaction.updateMany({ _id: { $in: duplicateIds } }, { $set: { 'flags.possibleDuplicate': true } });
  }

  return { large, duplicates };
}

/* ------------------------------------------------------------- top movers */

/**
 * Compares a month's spending per category against the average of the three
 * months before it. Shared by the tips engine and the monthly insight writer.
 */
async function categoryTrend(userId, month) {
  const previousKeys = [shiftMonth(month, -3), shiftMonth(month, -2), shiftMonth(month, -1)];

  const [current, history] = await Promise.all([
    categoryBreakdown(userId, { from: monthStart(month), to: monthEnd(month), type: 'expense' }),
    Transaction.aggregate([
      {
        $match: baseMatch(userId, {
          type: 'expense',
          date: { $gte: monthStart(previousKeys[0]), $lt: monthEnd(previousKeys[2]) }
        })
      },
      {
        $group: {
          _id: { category: '$category', month: { $dateToString: { format: '%Y-%m', date: '$date' } } },
          total: { $sum: '$amount' }
        }
      }
    ])
  ]);

  const historyBy = new Map();
  for (const row of history) {
    const id = row._id.category.toString();
    const list = historyBy.get(id) || [];
    list.push(row.total);
    historyBy.set(id, list);
  }

  return current.map((row) => {
    const past = historyBy.get(row.categoryId.toString()) || [];
    // Divide by 3 rather than past.length: a category used in only one of the
    // three months really does have a lower monthly average.
    const average = past.length ? past.reduce((a, b) => a + b, 0) / 3 : 0;
    const changePercent = average > 0 ? round(((row.total - average) / average) * 100) : null;

    return {
      ...row,
      previousAverage: round(average),
      change: round(row.total - average),
      changePercent,
      monthsOfHistory: past.length
    };
  });
}

module.exports = {
  monthTotals,
  categoryBreakdown,
  incomeVsExpense,
  dailySummary,
  budgetDailySummary,
  weeklySummary,
  budgetProgress,
  forecastNextMonth,
  detectAnomalies,
  refreshAnomalyFlags,
  categoryTrend,
  getAvailableBalance,
  syncSavingsToAvailableBalance,
  syncTransactionSavings,
  round
};
