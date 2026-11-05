require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('./config/db');

const User = require('./models/User');
const Category = require('./models/Category');
const Transaction = require('./models/Transaction');
const Budget = require('./models/Budget');
const Announcement = require('./models/Announcement');
const Insight = require('./models/Insight');
const Tip = require('./models/Tip');
const Notification = require('./models/Notification');
const ActivityLog = require('./models/ActivityLog');
const CategoryHint = require('./models/CategoryHint');

const { DEFAULT_CATEGORIES, TIP_TEMPLATES } = require('./config/defaults');
const { generateInsight } = require('./services/insights');
const { generateTips } = require('./services/tips');
const { checkBudgetAlerts } = require('./services/budgetAlerts');
const analytics = require('./services/analytics');
const { monthKey, shiftMonth, daysInMonth } = require('./utils/dates');

/**
 * Seeds the database with the default categories, an administrator, and two
 * demo students carrying six months of believable history. Safe to re-run:
 * `--fresh` wipes first, otherwise existing rows are left alone.
 */

const FRESH = process.argv.includes('--fresh');

/* Deterministic pseudo-random so every run produces the same demo data. */
let seedState = 20260929;
function random() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const between = (min, max) => min + random() * (max - min);
const pick = (list) => list[Math.floor(random() * list.length)];
const money = (n) => Math.round(n * 100) / 100;

const SPEND_PATTERNS = {
  Food: {
    weight: 0.34,
    perMonth: [18, 26],
    amount: [3, 14],
    notes: ['Campus Cafe lunch', 'Canteen combo', 'Chai and samosa', 'Dinner with roommates',
      'Grocery run', 'Late night noodles', 'Bakery breakfast', 'Juice bar', 'Food delivery']
  },
  Transport: {
    weight: 0.13,
    perMonth: [6, 11],
    amount: [2, 18],
    notes: ['Metro card top up', 'Bus pass', 'Rickshaw to campus', 'Cab share after class', 'Train ticket home']
  },
  'Hostel/Rent': {
    weight: 0.22,
    perMonth: [1, 2],
    amount: [120, 190],
    notes: ['Hostel rent', 'Room electricity share', 'Mess bill']
  },
  Academics: {
    weight: 0.11,
    perMonth: [2, 5],
    amount: [5, 55],
    notes: ['Data structures textbook', 'Lab manual', 'Printouts for assignment', 'Stationery', 'Course material']
  },
  Subscriptions: {
    weight: 0.07,
    perMonth: [2, 4],
    amount: [4, 12],
    notes: ['Music streaming', 'Video streaming', 'Mobile data pack', 'Cloud storage']
  },
  Entertainment: {
    weight: 0.09,
    perMonth: [3, 6],
    amount: [5, 25],
    notes: ['Cinema ticket', 'Weekend outing', 'Bowling with friends', 'Campus fest pass', 'Game top up']
  },
  Miscellaneous: {
    weight: 0.04,
    perMonth: [1, 4],
    amount: [3, 22],
    notes: ['Laundry', 'Haircut', 'Pharmacy', 'Phone repair', 'Gift for friend']
  }
};

const INCOME_PATTERNS = [
  { name: 'Allowance', day: 2, amount: [380, 420], note: 'Monthly allowance from home', always: true },
  { name: 'Part-time Job', day: 15, amount: [90, 160], note: 'Campus library shift', chance: 0.8 },
  { name: 'Scholarship', day: 8, amount: [150, 220], note: 'Merit scholarship instalment', chance: 0.35 },
  { name: 'Gift', day: 20, amount: [20, 60], note: 'Birthday money', chance: 0.25 }
];

async function seedCategories() {
  let created = 0;
  for (const category of DEFAULT_CATEGORIES) {
    const result = await Category.updateOne(
      { name: category.name, type: category.type, isDefault: true, owner: null },
      { $setOnInsert: { ...category, isDefault: true, owner: null } },
      { upsert: true }
    );
    if (result.upsertedCount) created += 1;
  }
  console.log(`  categories : ${created} created, ${DEFAULT_CATEGORIES.length - created} already present`);
  return Category.find({ isDefault: true }).lean();
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@campuscoin.app').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';

  let admin = await User.findOne({ email });
  if (!admin) {
    admin = new User({ name: 'System Administrator', email, role: 'admin' });
    await admin.setPassword(password);
    await admin.save();
    console.log(`  admin      : created ${email}`);
  } else {
    // Keep the documented password working even if the row already exists.
    admin.role = 'admin';
    admin.isDisabled = false;
    await admin.setPassword(password);
    await admin.save();
    console.log(`  admin      : refreshed ${email}`);
  }
  return admin;
}

async function seedAnnouncements(admin) {
  const existing = await Announcement.countDocuments();
  if (existing) {
    console.log(`  notices    : ${existing} already present`);
    return;
  }

  await Announcement.create({
    title: 'Welcome to Spendify',
    body: 'Log every expense the day it happens — one week of honest entries is enough for your first personalised tips.',
    kind: 'announcement',
    active: true,
    createdBy: admin._id
  });

  await Announcement.insertMany(
    TIP_TEMPLATES.map((t) => ({ ...t, kind: 'tipTemplate', active: true, createdBy: admin._id }))
  );

  console.log(`  notices    : 1 announcement and ${TIP_TEMPLATES.length} tip templates created`);
}

/** Builds six months of transactions for one student. */
async function seedStudent({ name, email, password, academicYear, allowance, savingsGoal, appetite }, categories) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`  student    : ${email} already exists, skipped`);
    return existing;
  }

  const student = new User({
    name,
    email: email.toLowerCase(),
    role: 'student',
    academicYear,
    monthlyAllowance: allowance,
    savingsGoal
  });
  await student.setPassword(password);
  await student.save();

  const byName = new Map(categories.map((c) => [c.name, c]));
  const current = monthKey();
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(current, i - 5));
  const documents = [];

  months.forEach((month, monthIndex) => {
    const [year, m] = month.split('-').map(Number);
    const lastDay = daysInMonth(month);
    const isCurrentMonth = month === current;
    const today = new Date().getDate();
    const cutoff = isCurrentMonth ? Math.max(4, today) : lastDay;

    /* --- income --- */
    for (const rule of INCOME_PATTERNS) {
      if (!rule.always && random() > rule.chance) continue;
      if (rule.day > cutoff) continue;
      const category = byName.get(rule.name);
      if (!category) continue;

      documents.push({
        user: student._id,
        category: category._id,
        type: 'income',
        amount: money(between(rule.amount[0], rule.amount[1])),
        description: rule.note,
        date: new Date(year, m - 1, rule.day, 10, 0),
        source: 'manual'
      });
    }

    /* --- expenses ---
       `drift` gives the last two months a visible upward trend in Food and
       Entertainment, so the insight writer and the tips engine have something
       real to flag in a demo. */
    const drift = monthIndex >= 4 ? 1.35 : 1;

    for (const [categoryName, pattern] of Object.entries(SPEND_PATTERNS)) {
      const category = byName.get(categoryName);
      if (!category) continue;

      const trending = ['Food', 'Entertainment'].includes(categoryName) ? drift : 1;
      const count = Math.round(between(pattern.perMonth[0], pattern.perMonth[1]) * appetite * trending);

      for (let i = 0; i < count; i += 1) {
        const day = Math.min(cutoff, 1 + Math.floor(random() * lastDay));
        documents.push({
          user: student._id,
          category: category._id,
          type: 'expense',
          amount: money(between(pattern.amount[0], pattern.amount[1]) * appetite * trending),
          description: pick(pattern.notes),
          date: new Date(year, m - 1, day, 12 + Math.floor(random() * 8), 0),
          source: 'manual'
        });
      }
    }
  });

  // One recurring rule so the feature is visible without setting it up by hand.
  const subscriptions = byName.get('Subscriptions');
  if (subscriptions) {
    const nextMonth = shiftMonth(current, 1);
    const [ny, nm] = nextMonth.split('-').map(Number);
    documents.push({
      user: student._id,
      category: subscriptions._id,
      type: 'expense',
      amount: 9.99,
      description: 'Video streaming subscription',
      date: new Date(new Date().getFullYear(), new Date().getMonth(), 5, 9, 0),
      source: 'manual',
      isRecurring: true,
      recurrence: { frequency: 'monthly', nextRunOn: new Date(ny, nm - 1, 5), endsOn: null, active: true }
    });
  }

  const created = await Transaction.insertMany(documents);

  await ActivityLog.insertMany(
    created.slice(-12).map((t) => ({
      user: student._id,
      transaction: t._id,
      action: 'created',
      snapshot: { amount: t.amount, description: t.description, date: t.date }
    }))
  );

  /* --- budgets for the current month --- */
  const budgetPlan = { Food: 180, Transport: 60, Entertainment: 70, Subscriptions: 30, Academics: 80 };
  for (const [categoryName, limitAmount] of Object.entries(budgetPlan)) {
    const category = byName.get(categoryName);
    if (!category) continue;
    await Budget.create({
      user: student._id,
      category: category._id,
      month: current,
      limitAmount: money(limitAmount * appetite)
    });
  }

  /* --- derived data, built through the real services --- */
  await analytics.refreshAnomalyFlags(student._id);
  await checkBudgetAlerts(student, current);
  for (const month of months.slice(-3)) {
    await generateInsight(student, month);
  }
  await generateTips(student, current);

  const totals = await analytics.monthTotals(student._id, current);
  console.log(
    `  student    : ${email} — ${created.length} transactions, ` +
      `this month ${totals.income} in / ${totals.expense} out`
  );

  return student;
}

async function run() {
  console.log('\n  Spendify — seeding\n');
  await connectDatabase();

  if (FRESH) {
    await Promise.all([
      User.deleteMany({}), Category.deleteMany({}), Transaction.deleteMany({}),
      Budget.deleteMany({}), Announcement.deleteMany({}), Insight.deleteMany({}),
      Tip.deleteMany({}), Notification.deleteMany({}), ActivityLog.deleteMany({}),
      CategoryHint.deleteMany({})
    ]);
    console.log('  reset      : all collections cleared (--fresh)');
  }

  const categories = await seedCategories();
  const admin = await seedAdmin();
  await seedAnnouncements(admin);

  await seedStudent(
    {
      name: 'Ayesha Khan',
      email: 'ayesha@student.campuscoin.app',
      password: 'Student@123',
      academicYear: '2nd Year',
      allowance: 400,
      savingsGoal: 80,
      appetite: 1
    },
    categories
  );

  await seedStudent(
    {
      name: 'Daniyal Raza',
      email: 'daniyal@student.campuscoin.app',
      password: 'Student@123',
      academicYear: '4th Year',
      allowance: 520,
      savingsGoal: 120,
      appetite: 1.25
    },
    categories
  );

  console.log('\n  Sign-in details');
  console.log('  ---------------------------------------------------------------');
  console.log(`  Admin    ${process.env.ADMIN_EMAIL || 'admin@campuscoin.app'}  /  ${process.env.ADMIN_PASSWORD || 'Admin@123'}`);
  console.log('  Student  ayesha@student.campuscoin.app          /  Student@123');
  console.log('  Student  daniyal@student.campuscoin.app         /  Student@123');
  console.log('  ---------------------------------------------------------------\n');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\n  Seeding failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
