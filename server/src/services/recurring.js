const Transaction = require('../models/Transaction');
const RecurringPayment = require('../models/RecurringPayment');
const analytics = require('./analytics');
const ActivityLog = require('../models/ActivityLog');
const { startOfDay, addDays } = require('../utils/dates');

/**
 * Recurring entries (monthly allowance, subscription charges).
 *
 * A rule is a transaction with `recurrence` set. `runDueRecurring` walks forward
 * from `nextRunOn`, creating one real transaction per due date, so a student who
 * has not opened the app for two months still gets both entries rather than one.
 */

function advance(date, frequency) {
  if (frequency === 'weekly') return addDays(date, 7);
  const current = new Date(date);
  const monthOffset = frequency === 'yearly' ? 12 : 1;
  const targetMonth = new Date(current.getFullYear(), current.getMonth() + monthOffset, 1);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  targetMonth.setDate(Math.min(current.getDate(), lastDay));
  targetMonth.setHours(current.getHours(), current.getMinutes(), current.getSeconds(), current.getMilliseconds());
  return targetMonth;
}

/** Generates every occurrence due up to today for one student (or all, if omitted). */
async function runDueRecurring(userId = null) {
  const today = startOfDay(new Date());
  const filter = {
    isRecurring: true,
    deletedAt: null,
    'recurrence.active': true,
    'recurrence.nextRunOn': { $lte: today }
  };
  if (userId) filter.user = userId;

  const rules = await Transaction.find(filter);
  const created = [];

  for (const rule of rules) {
    let next = startOfDay(rule.recurrence.nextRunOn);
    const endsOn = rule.recurrence.endsOn ? startOfDay(rule.recurrence.endsOn) : null;
    let guard = 0;

    while (next <= today && guard < 60) {
      if (endsOn && next > endsOn) {
        rule.recurrence.active = false;
        break;
      }

      const entry = await Transaction.create({
        user: rule.user,
        category: rule.category,
        type: rule.type,
        amount: rule.amount,
        description: rule.description,
        note: rule.note,
        date: next,
        source: 'recurring',
        generatedFrom: rule._id
      });
      await analytics.syncTransactionSavings(rule.user, entry);

      await ActivityLog.create({
        user: rule.user,
        transaction: entry._id,
        action: 'created',
        changes: ['recurring rule'],
        snapshot: { amount: entry.amount, description: entry.description, date: entry.date }
      });

      created.push(entry);
      next = advance(next, rule.recurrence.frequency);
      guard += 1;
    }

    rule.recurrence.nextRunOn = next;
    if (endsOn && next > endsOn) rule.recurrence.active = false;
    await rule.save();
  }

  const paymentFilter = {
    active: true,
    nextRunOn: { $lte: today }
  };
  if (userId) paymentFilter.user = userId;
  const payments = await RecurringPayment.find(paymentFilter);
  for (const payment of payments) {
    let next = startOfDay(payment.nextRunOn);
    const endsOn = payment.endDate ? startOfDay(payment.endDate) : null;
    let guard = 0;

    while (next <= today && guard < 120) {
      if (endsOn && next > endsOn) {
        payment.active = false;
        break;
      }

      const entry = await Transaction.create({
        user: payment.user,
        category: payment.category,
        type: payment.type,
        amount: payment.amount,
        description: payment.name,
        note: payment.description,
        date: next,
        source: 'recurring',
        recurringPayment: payment._id
      });
      await analytics.syncTransactionSavings(payment.user, entry);
      await ActivityLog.create({
        user: payment.user,
        transaction: entry._id,
        action: 'created',
        changes: ['recurring payment'],
        snapshot: { name: payment.name, amount: entry.amount, date: entry.date }
      });

      created.push(entry);
      next = advance(next, payment.frequency);
      guard += 1;
    }

    payment.nextRunOn = next;
    if (endsOn && next > endsOn) payment.active = false;
    await payment.save();
  }

  return created;
}

/** First run date for a new rule: the start date itself if it is still ahead. */
function firstRunDate(startDate, frequency) {
  const start = startOfDay(startDate);
  const today = startOfDay(new Date());
  if (start > today) return start;

  let next = start;
  let guard = 0;
  while (next <= today && guard < 120) {
    next = advance(next, frequency);
    guard += 1;
  }
  return next;
}

module.exports = { runDueRecurring, firstRunDate, advance };
