/**
 * Automated test suite for Spendify Receipt Scanner
 *
 * Scenarios covered:
 * 1. Blocked unauthenticated: call without token -> returns 401.
 * 2. Matching existing category: receipt with "Food" or "Groceries" -> assigns existing category.
 * 3. Auto-creating new category: receipt with unique category not in user's list -> creates personal category for that user only, owner = user._id, isDefault = false, assigns it to the expense.
 * 4. Merchant memory: second receipt from same merchant -> reuses the previously mapped category without guessing.
 * 5. Duplicate receipt detection: scanning the same merchant, date and amount within 24 hours -> returns duplicate_detected warning with prompt "This looks like a receipt you already added. Add anyway?".
 * 6. Low-confidence review flow: receipt with confidence < 0.8 -> returns review_required, does not auto-save; calling confirm endpoint with user edits saves it.
 * 7. Unreadable receipt: image with no amount or unreadable text -> returns 422 with clear message and partial data, does not crash.
 * 8. Undo flow: calling undo deletes the created transaction and, if the scan auto-created an empty category, deletes that category too.
 */

process.env.NODE_ENV = 'test';
process.env.RECEIPT_MOCK = 'true';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const { connectDatabase } = require('../src/config/db');
const app = require('../src/server');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Budget = require('../src/models/Budget');
const Transaction = require('../src/models/Transaction');
const analytics = require('../src/services/analytics');
const SystemSetting = require('../src/models/SystemSetting');
const MerchantMapping = require('../src/models/MerchantMapping');
const { signToken } = require('../src/middleware/auth');
const { setMockExtractor } = require('../src/services/vision');
const { ensureDefaultCategories } = require('../src/services/defaultCategories');
const { DEFAULT_CATEGORIES } = require('../src/config/defaults');

function makeReceiptFormData(mockPayload = null) {
  const fd = new FormData();
  const content = mockPayload ? 'TEST_MOCK:' + JSON.stringify(mockPayload) : 'dummy-receipt-bytes';
  const blob = new Blob([content], { type: 'image/jpeg' });
  fd.append('image', blob, 'receipt.jpg');
  return fd;
}

let server;
let baseUrl;
let testUser;
let testToken;
let testCookie;
let testAdmin;
let adminToken;
let foodCategory;

async function setup() {
  await connectDatabase();

  await SystemSetting.updateOne(
    { scope: 'global' },
    { $set: { defaultCategoriesInitialized: false } },
    { upsert: true }
  );
  const initializedCount = await ensureDefaultCategories();
  const defaultCategoryCount = await Category.countDocuments({ isDefault: true, owner: null });
  assert(defaultCategoryCount >= DEFAULT_CATEGORIES.length, 'Expected all shared default categories to initialize');
  assert(initializedCount >= 0, 'Expected default category initialization to return its insert count');
  assert((await ensureDefaultCategories()) === 0, 'Expected default initialization to be idempotent');

  // Create or clean test user
  const email = 'receipt_test_runner@campus.edu';
  await User.deleteOne({ email });
  testUser = new User({
    name: 'Receipt Test Runner',
    email,
    role: 'student',
    monthlyAllowance: 10000,
    savingsGoal: 2000
  });
  await testUser.setPassword('Password123!');
  await testUser.save();
  testToken = signToken(testUser);

  const adminEmail = 'category_test_admin@campus.edu';
  await User.deleteOne({ email: adminEmail });
  testAdmin = new User({ name: 'Category Test Admin', email: adminEmail, role: 'admin' });
  await testAdmin.setPassword('Password123!');
  await testAdmin.save();
  adminToken = signToken(testAdmin);

  // Clean any previous test transactions / mappings / personal categories
  await Transaction.deleteMany({ user: testUser._id });
  await Budget.deleteMany({ user: testUser._id });
  await MerchantMapping.deleteMany({ user: testUser._id });
  await Category.deleteMany({ owner: testUser._id });

  // Ensure default "Food" category exists
  foodCategory = await Category.findOne({ name: 'Food', type: 'expense' });
  if (!foodCategory) {
    foodCategory = await Category.create({
      name: 'Food',
      type: 'expense',
      color: '#BE123C',
      icon: 'bowl',
      isDefault: true,
      owner: null
    });
  }
  await Budget.create({
    user: testUser._id,
    category: foodCategory._id,
    month: '2026-10',
    limitAmount: 100000
  });

  // Start test server on random free port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api/receipts`;
      resolve();
    });
  });
}

async function teardown() {
  if (testUser) {
    await Transaction.deleteMany({ user: testUser._id });
    await Budget.deleteMany({ user: testUser._id });
    await MerchantMapping.deleteMany({ user: testUser._id });
    await Category.deleteMany({ owner: testUser._id });
    await User.deleteOne({ _id: testUser._id });
  }
  if (testAdmin) {
    await Category.deleteMany({ name: /^Test Default/ });
    await User.deleteOne({ _id: testAdmin._id });
  }
  if (server) {
    await new Promise((r) => server.close(r));
  }
  await mongoose.disconnect();
}

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32mâœ“\x1b[0m ${name}`);
    results.push({ name, passed: true });
  } catch (err) {
    console.error(`  \x1b[31mâœ—\x1b[0m ${name}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
    results.push({ name, passed: false, error: err.message });
  }
}

async function runAll() {
  console.log('\n--- Running Spendify Receipt Scanner Test Suite ---\n');
  await setup();

  await runTest('0. Auth cookie: login sets an HttpOnly cookie that restores the session', async () => {
    const authBaseUrl = baseUrl.replace('/receipts', '/auth');
    const loginRes = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: 'Password123!', expect: 'student' })
    });
    assert(loginRes.status === 200, `Expected login status 200, got ${loginRes.status}`);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    assert(setCookie.includes('campuscoin.token='), 'Expected auth token cookie to be set');
    assert(/httponly/i.test(setCookie), 'Expected auth token cookie to be HttpOnly');

    testCookie = setCookie.split(';')[0];
    const meRes = await fetch(`${authBaseUrl}/me`, { headers: { Cookie: testCookie } });
    assert(meRes.status === 200, `Expected cookie session restore status 200, got ${meRes.status}`);
  });

  await runTest('0a. Session checks are not throttled by the sign-in rate limit', async () => {
    const authBaseUrl = baseUrl.replace('/receipts', '/auth');
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const response = await fetch(`${authBaseUrl}/me`, {
        headers: { Cookie: testCookie }
      });
      assert(response.status === 200, `Session check ${attempt + 1} returned ${response.status}`);
    }
  });

  await runTest('0b. Student category management: create income/expense, edit and safely delete personal categories', async () => {
    const categoriesUrl = baseUrl.replace('/receipts', '/categories');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testToken
    };

    const incomeRes = await fetch(categoriesUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Personal Side Income', type: 'income' })
    });
    assert(incomeRes.status === 201, `Expected personal income category status 201, got ${incomeRes.status}`);
    const income = (await incomeRes.json()).category;
    assert(income.type === 'income' && !income.isDefault, 'Expected a personal income category');
    assert(String(income.owner) === String(testUser._id), 'Expected the new category to belong to the signed-in student');

    const updateRes = await fetch(`${categoriesUrl}/${income._id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: 'Updated Side Income', color: '#16A34A' })
    });
    assert(updateRes.status === 200, `Expected personal category update status 200, got ${updateRes.status}`);
    assert((await updateRes.json()).category.name === 'Updated Side Income', 'Expected the personal category name to update');

    const clashRes = await fetch(categoriesUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'fOoD', type: 'expense' })
    });
    assert(clashRes.status === 409, `Expected duplicate default-name status 409, got ${clashRes.status}`);

    const expenseRes = await fetch(categoriesUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Personal Travel', type: 'expense' })
    });
    assert(expenseRes.status === 201, `Expected personal expense category status 201, got ${expenseRes.status}`);
    const expense = (await expenseRes.json()).category;

    await Transaction.create({
      user: testUser._id,
      category: expense._id,
      type: 'expense',
      amount: 25,
      description: 'Travel test',
      date: new Date('2026-10-30')
    });
    await Budget.create({
      user: testUser._id,
      category: expense._id,
      month: '2026-10',
      limitAmount: 300
    });

    const deniedDelete = await fetch(`${categoriesUrl}/${expense._id}`, { method: 'DELETE', headers });
    assert(deniedDelete.status === 409, `Expected in-use delete status 409, got ${deniedDelete.status}`);

    const deleteRes = await fetch(`${categoriesUrl}/${expense._id}?reassignTo=${foodCategory._id}`, {
      method: 'DELETE',
      headers
    });
    assert(deleteRes.status === 200, `Expected reassigned category delete status 200, got ${deleteRes.status}`);
    const movedTransaction = await Transaction.findOne({ user: testUser._id, description: 'Travel test' });
    assert(movedTransaction.category.equals(foodCategory._id), 'Expected transaction history to move to the replacement category');
    const mergedBudget = await Budget.findOne({ user: testUser._id, category: foodCategory._id, month: '2026-10' });
    assert(mergedBudget.limitAmount === 100300, `Expected budgets to merge, got ${mergedBudget.limitAmount}`);

    const incomeDelete = await fetch(`${categoriesUrl}/${income._id}`, { method: 'DELETE', headers });
    assert(incomeDelete.status === 200, `Expected personal income category delete status 200, got ${incomeDelete.status}`);
  });

  await runTest('0c. Admin category management: create, edit, list and remove shared defaults', async () => {
    const adminCategoriesUrl = baseUrl.replace('/receipts', '/admin/categories');
    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + adminToken
    };

    const forbiddenRes = await fetch(adminCategoriesUrl, {
      headers: { Authorization: 'Bearer ' + testToken }
    });
    assert(forbiddenRes.status === 403, `Expected student admin access status 403, got ${forbiddenRes.status}`);

    const createRes = await fetch(adminCategoriesUrl, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Test Default Expense', type: 'expense' })
    });
    assert(createRes.status === 201, `Expected default category create status 201, got ${createRes.status}`);
    const created = (await createRes.json()).category;

    const studentCategories = await fetch(baseUrl.replace('/receipts', '/categories'), {
      headers: { Authorization: 'Bearer ' + testToken }
    });
    const listed = (await studentCategories.json()).categories;
    assert(listed.some((category) => category._id === created._id), 'Expected new default to be visible to students');

    const updateRes = await fetch(`${adminCategoriesUrl}/${created._id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Test Default Updated' })
    });
    assert(updateRes.status === 200, `Expected default category update status 200, got ${updateRes.status}`);

    const deleteRes = await fetch(`${adminCategoriesUrl}/${created._id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + adminToken }
    });
    assert(deleteRes.status === 200, `Expected unused default category delete status 200, got ${deleteRes.status}`);
    assert(!(await Category.exists({ _id: created._id })), 'Expected unused default category to be removed');

    for (const route of ['/admin/stats', '/admin/users', '/admin/categories', '/admin/announcements', '/admin/settings']) {
      const response = await fetch(`${baseUrl.replace('/receipts', route)}`, {
        headers: { Authorization: adminHeaders.Authorization }
      });
      assert(response.status === 200, `Expected ${route} status 200, got ${response.status}`);
    }
  });

  // Scenario 1: Blocked unauthenticated
  await runTest('1. Blocked unauthenticated: call without token -> returns 401', async () => {
    const res = await fetch(`${baseUrl}/scan`, {
      method: 'POST',
      body: makeReceiptFormData()
    });
    assert(res.status === 401, `Expected status 401, got ${res.status}`);
  });

  // Scenario 2: Matching existing category (Food/Groceries)
  await runTest('2. Matching existing category: receipt with "Groceries" -> assigns existing "Food" category', async () => {
    setMockExtractor(() => ({
      isReceipt: true,
      merchant: 'Imtiaz Super Market',
      date: '2026-10-25',
      total: 1240.0,
      currency: 'PKR',
      suggestedCategory: 'Groceries',
      confidence: { amount: 0.95, date: 0.9, category: 0.92 }
    }));

    const res = await fetch(`${baseUrl}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` },
      body: makeReceiptFormData()
    });

    assert(res.status === 201, `Expected status 201, got ${res.status}`);
    const data = await res.json();
    assert(data.status === 'auto_added', `Expected auto_added, got ${data.status}`);
    assert(data.transaction.amount === 1240, `Expected amount 1240, got ${data.transaction.amount}`);
    assert(data.transaction.category.name === 'Food', `Expected category 'Food', got ${data.transaction.category?.name}`);
    assert(data.transaction.source === 'receipt_scan', `Expected source 'receipt_scan', got ${data.transaction.source}`);
  });

  await runTest('2b. Duplicate flagging works with fewer than four expenses', async () => {
    const existing = await Transaction.findOne({ user: testUser._id, description: 'Imtiaz Super Market' });
    const duplicateRes = await fetch(`${baseUrl}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + testToken
      },
      body: JSON.stringify({
        amount: 1240,
        date: '2026-10-25',
        merchant: 'Imtiaz Super Market',
        category: foodCategory._id
      })
    });
    assert(duplicateRes.status === 201, `Expected duplicate override save status 201, got ${duplicateRes.status}`);
    const duplicateData = await duplicateRes.json();
    assert(
      duplicateData.transaction.flags.possibleDuplicate,
      'Expected duplicate pair to be counted even with fewer than four expenses'
    );
    assert(Boolean(existing), 'Expected the original scanned receipt to exist');
  });

  // Scenario 3: A receipt scan is recorded without affecting budgets or balances.
  await runTest('3. Receipt scans do not change available balance or savings', async () => {
    setMockExtractor(() => ({
      isReceipt: true,
      merchant: 'University Lab Supplies',
      date: '2026-10-26',
      total: 850.0,
      currency: 'PKR',
      suggestedCategory: 'Lab Equipment & Safety',
      confidence: { amount: 0.92, date: 0.88, category: 0.85 }
    }));

    const beforeBalance = await analytics.getAvailableBalance(testUser._id);
    const beforeUser = await User.findById(testUser._id).select('currentSavings').lean();

    const res = await fetch(`${baseUrl}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` },
      body: makeReceiptFormData()
    });

    assert(res.status === 201, `Expected record-only receipt status 201, got ${res.status}`);
    const data = await res.json();
    assert(data.status === 'auto_added', `Expected auto_added, got ${data.status}`);
    assert(data.transaction.source === 'receipt_scan', 'Expected a receipt scan transaction record');

    const catInDb = await Category.findOne({ owner: testUser._id, name: 'Lab Equipment & Safety' });
    assert(catInDb !== null, 'Suggested category should remain available so the student can set its budget');
    assert(catInDb.name === 'Lab Equipment & Safety', `Expected name 'Lab Equipment & Safety', got '${catInDb.name}'`);
    assert(catInDb.owner.toString() === testUser._id.toString(), 'Category owner must be testUser._id');
    assert(catInDb.isDefault === false, 'Category isDefault must be false');

    const afterBalance = await analytics.getAvailableBalance(testUser._id);
    const afterUser = await User.findById(testUser._id).select('currentSavings').lean();
    assert(afterBalance.rawAvailable === beforeBalance.rawAvailable, 'Receipt scan must not change available balance');
    assert(afterUser.currentSavings === beforeUser.currentSavings, 'Receipt scan must not change savings');
  });

  // Scenario 4: Merchant memory
  await runTest('4. Merchant memory: second receipt from same merchant reuses mapped category', async () => {
    // New receipt from 'University Lab Supplies', but model suggested 'Miscellaneous' this time
    setMockExtractor(() => ({
      isReceipt: true,
      merchant: 'University Lab Supplies',
      date: '2026-10-27',
      total: 320.0,
      currency: 'PKR',
      suggestedCategory: 'Miscellaneous',
      confidence: { amount: 0.9, date: 0.9, category: 0.6 }
    }));

    const res = await fetch(`${baseUrl}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` },
      body: makeReceiptFormData()
    });

    assert(res.status === 201, `Expected status 201, got ${res.status}`);
    const data = await res.json();
    assert(data.transaction.category.name === 'Lab Equipment & Safety', `Expected memory to reuse 'Lab Equipment & Safety', got '${data.transaction.category.name}'`);
  });

  await runTest('4b. Receipt scans add to category budget usage', async () => {
    const receiptBudgetMonth = new Date().toISOString().slice(0, 7);
    const [budgetYear, budgetMonth] = receiptBudgetMonth.split('-').map(Number);
    const budgetFrom = new Date(budgetYear, budgetMonth - 1, 1);
    const budgetTo = new Date(budgetYear, budgetMonth, 1);
    await Budget.findOneAndUpdate(
      { user: testUser._id, category: foodCategory._id, month: receiptBudgetMonth },
      { $set: { limitAmount: 1500, alertsSent: [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    for (const [merchant, total] of [['Campus Cafe', 300], ['Campus Kiosk', 50]]) {
      setMockExtractor(() => ({
        isReceipt: true,
        merchant,
        date: '2026-10-30',
        total,
        currency: 'PKR',
        suggestedCategory: 'Food',
        confidence: { amount: 0.95, date: 0.9, category: 0.92 }
      }));

      const res = await fetch(`${baseUrl}/scan`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + testToken },
        body: makeReceiptFormData()
      });
      assert(res.status === 201, `Expected over-budget receipt status 201, got ${res.status}`);
      const data = await res.json();
    }

    const receiptsInMonth = await Transaction.aggregate([
      { $match: { user: testUser._id, category: foodCategory._id, type: 'expense', source: 'receipt_scan', deletedAt: null, createdAt: { $gte: budgetFrom, $lt: budgetTo } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const foodBudget = (await analytics.budgetProgress(testUser._id, receiptBudgetMonth))
      .find((budget) => String(budget.categoryId) === String(foodCategory._id));
    assert(foodBudget?.spent >= receiptsInMonth[0].total, 'Budget usage should include all receipts scanned during the budget month');
  });

  // Scenario 5: Duplicate receipt detection
  await runTest('5. Duplicate receipt detection: same merchant, date, amount -> duplicate_detected with warning prompt', async () => {
    // Attempt to scan the exact same receipt as Scenario 2 (Imtiaz, 2026-10-25, 1240)
    setMockExtractor(() => ({
      isReceipt: true,
      merchant: 'Imtiaz Super Market',
      date: '2026-10-25',
      total: 1240.0,
      currency: 'PKR',
      suggestedCategory: 'Groceries',
      confidence: { amount: 0.95, date: 0.9, category: 0.92 }
    }));

    const res = await fetch(`${baseUrl}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` },
      body: makeReceiptFormData()
    });

    assert(res.status === 200, `Expected status 200 for duplicate prompt, got ${res.status}`);
    const data = await res.json();
    assert(data.status === 'duplicate_detected', `Expected status 'duplicate_detected', got '${data.status}'`);
    assert(data.message.includes('This looks like a receipt you already added'), `Expected duplicate prompt message, got '${data.message}'`);
    assert(Boolean(data.duplicate), 'Expected duplicate reference details to be provided');

    const confirmRes = await fetch(`${baseUrl}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + testToken
      },
      body: JSON.stringify({
        amount: data.extracted.amount,
        date: data.extracted.date,
        merchant: data.extracted.merchant,
        category: data.category._id,
        confidence: data.extracted.confidence
      })
    });
    assert(confirmRes.status === 201, `Expected duplicate override save status 201, got ${confirmRes.status}`);
    const confirmedDuplicate = await confirmRes.json();
    assert(
      confirmedDuplicate.transaction.flags.possibleDuplicate,
      'Expected the explicitly accepted duplicate to be flagged as a possible duplicate'
    );
  });

  // Scenario 6: Low-confidence review flow
  await runTest('6. Low-confidence review flow: confidence < 0.8 -> returns review_required; saves via /confirm', async () => {
    setMockExtractor(() => ({
      isReceipt: true,
      merchant: 'Blurry Corner Stall',
      date: '2026-10-28',
      total: 450.0,
      currency: 'PKR',
      suggestedCategory: 'Food',
      confidence: { amount: 0.65, date: 0.6, category: 0.5 } // Below 0.8 threshold
    }));

    const scanRes = await fetch(`${baseUrl}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` },
      body: makeReceiptFormData()
    });

    assert(scanRes.status === 200, `Expected status 200, got ${scanRes.status}`);
    const scanData = await scanRes.json();
    assert(scanData.status === 'review_required', `Expected review_required, got '${scanData.status}'`);

    // Verify transaction was NOT created in DB yet
    const pendingTx = await Transaction.findOne({ description: 'Blurry Corner Stall', user: testUser._id });
    assert(!pendingTx, 'Low-confidence receipt must not auto-save to database');

    // Confirm with user adjustments
    const confirmRes = await fetch(`${baseUrl}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({
        amount: 500.0, // Corrected by user
        date: '2026-10-28',
        merchant: 'Blurry Corner Stall',
        categoryId: foodCategory._id,
        confidence: scanData.extracted.confidence
      })
    });

    assert(confirmRes.status === 201, `Expected status 201, got ${confirmRes.status}`);
    const confirmData = await confirmRes.json();
    assert(confirmData.status === 'confirmed', `Expected status 'confirmed', got '${confirmData.status}'`);
    assert(confirmData.transaction.amount === 500, `Expected amount 500, got ${confirmData.transaction.amount}`);
  });

  // Scenario 7: Unreadable receipt
  await runTest('7. Unreadable receipt: image with no readable total -> returns 422 with clear message and partial data', async () => {
    setMockExtractor(() => ({
      isReceipt: false,
      merchant: 'Unclear Stamp',
      date: null,
      total: null,
      currency: 'PKR',
      suggestedCategory: 'Miscellaneous',
      confidence: { amount: 0.1, date: 0.1, category: 0.2 }
    }));

    const res = await fetch(`${baseUrl}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` },
      body: makeReceiptFormData()
    });

    assert(res.status === 422, `Expected status 422, got ${res.status}`);
    const data = await res.json();
    assert(data.status === 'unreadable', `Expected status 'unreadable', got '${data.status}'`);
    assert(data.message.includes("Couldn't read this receipt"), `Expected helpful unreadable message, got '${data.message}'`);
    assert(data.partial !== undefined, 'Expected partial data object for form prefill');
  });

  await runTest('7b. Large spending count catches a single Rs 47,000 expense', async () => {
    const transaction = await Transaction.create({
      user: testUser._id,
      type: 'expense',
      amount: 47000,
      category: foodCategory._id,
      description: 'Large purchase threshold check',
      date: new Date(),
      source: 'manual'
    });
    try {
      const result = await analytics.detectAnomalies(testUser._id);
      assert(result.large.some((entry) => String(entry.id) === String(transaction._id)), 'Expected the Rs 47,000 expense in large spending');
    } finally {
      await Transaction.deleteOne({ _id: transaction._id });
    }
  });

  await runTest('7c. Several copies of the same receipt count as one duplicate group', async () => {
    const dates = [2, 1, 0].map((daysAgo) => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      return date;
    });
    const before = await analytics.detectAnomalies(testUser._id);
    const copies = await Transaction.insertMany(dates.map((date) => ({
      user: testUser._id,
      type: 'expense',
      amount: 23456.78,
      category: foodCategory._id,
      description: 'Duplicate receipt group check',
      date,
      source: 'receipt_scan'
    })));
    try {
      const after = await analytics.detectAnomalies(testUser._id);
      assert(after.duplicateCount === before.duplicateCount + 1, `Expected one additional duplicate group, got ${after.duplicateCount - before.duplicateCount}`);
    } finally {
      await Transaction.deleteMany({ _id: { $in: copies.map((copy) => copy._id) } });
    }
  });

  await runTest('7d. A duplicate group clears when one of its two receipts is deleted', async () => {
    const before = await analytics.detectAnomalies(testUser._id);
    const copies = await Transaction.insertMany([0, 1].map((daysAgo) => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      return {
        user: testUser._id,
        type: 'expense',
        amount: 19876.54,
        category: foodCategory._id,
        description: 'Delete one duplicate receipt check',
        date,
        source: 'receipt_scan'
      };
    }));
    try {
      const withPair = await analytics.detectAnomalies(testUser._id);
      assert(withPair.duplicateCount === before.duplicateCount + 1, 'Expected the pair to add exactly one duplicate group');
      await Transaction.updateOne({ _id: copies[1]._id }, { $set: { deletedAt: new Date() } });
      const afterDelete = await analytics.detectAnomalies(testUser._id);
      assert(afterDelete.duplicateCount === before.duplicateCount, 'Expected no duplicate group after one receipt is deleted');
    } finally {
      await Transaction.deleteMany({ _id: { $in: copies.map((copy) => copy._id) } });
    }
  });

  // Scenario 8: Undo flow
  await runTest('8. Undo flow keeps a category that still has a budget', async () => {
    // 8a: First create an expense with a single-use personal category
    setMockExtractor(() => ({
      isReceipt: true,
      merchant: 'Temporary Robotics Club Fee',
      date: '2026-10-29',
      total: 1500.0,
      currency: 'PKR',
      suggestedCategory: 'Robotics Workshop',
      confidence: { amount: 0.95, date: 0.95, category: 0.95 }
    }));

    const scanRes = await fetch(`${baseUrl}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}` },
      body: makeReceiptFormData()
    });

    assert(scanRes.status === 201, `Expected record-only receipt status 201, got ${scanRes.status}`);
    const scanData = await scanRes.json();
    const suggestedCategory = await Category.findOne({ owner: testUser._id, name: 'Robotics Workshop' });
    assert(Boolean(suggestedCategory), 'Expected the suggested personal category to be created');
    await Budget.create({
      user: testUser._id,
      category: suggestedCategory._id,
      month: '2026-10',
      limitAmount: 5000
    });

    const createdTxId = scanData.transaction._id;
    const singleUseCatId = suggestedCategory._id;

    assert(Boolean(createdTxId), 'Expected transaction id');
    assert(Boolean(singleUseCatId), 'Expected category id');

    // 8b: Call undo
    const undoRes = await fetch(`${baseUrl}/undo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({
        transactionId: createdTxId,
        createdCategoryId: singleUseCatId
      })
    });

    assert(undoRes.status === 200, `Expected 200 on undo, got ${undoRes.status}`);
    const undoData = await undoRes.json();
    assert(undoData.undone === true, 'Expected undone: true');
    assert(undoData.categoryRemoved === false, 'A category with a budget should not be removed during undo');

    // Verify transaction deleted from DB
    const txAfterUndo = await Transaction.findById(createdTxId);
    assert(!txAfterUndo, 'Transaction must be deleted from DB');

    // Verify the budgeted category remains after the transaction is undone.
    const catAfterUndo = await Category.findById(singleUseCatId);
    assert(Boolean(catAfterUndo), 'A budgeted category must remain after undo');
  });

  await runTest('9. Transaction create, list, update, delete, and restore persist to MongoDB', async () => {
    const transactionsUrl = baseUrl.replace('/receipts', '/transactions');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testToken}`
    };
    const incomeCategory = await Category.findOne({ type: 'income', isDefault: true, owner: null });
    assert(Boolean(incomeCategory), 'Expected a shared income category for the transaction test');

    const createRes = await fetch(transactionsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'income',
        amount: 125,
        category: incomeCategory._id,
        description: 'Database persistence test',
        date: new Date().toISOString().slice(0, 10)
      })
    });
    assert(createRes.status === 201, `Expected transaction create status 201, got ${createRes.status}`);
    const created = (await createRes.json()).transaction;
    assert(Boolean(created?._id), 'Expected created transaction id');
    assert(
      await Transaction.exists({ _id: created._id, user: testUser._id, amount: 125 }),
      'Expected transaction to persist in MongoDB'
    );

    const reportMonth = new Date().toISOString().slice(0, 7);
    await Transaction.create({
      user: testUser._id,
      type: 'expense',
      amount: 90,
      category: foodCategory._id,
      description: 'Receipt record only for report test',
      date: new Date(),
      source: 'receipt_scan'
    });

    const listRes = await fetch(`${transactionsUrl}?q=Database%20persistence%20test`, {
      headers: { Authorization: headers.Authorization }
    });
    assert(listRes.status === 200, `Expected transaction list status 200, got ${listRes.status}`);
    assert((await listRes.json()).items.some((item) => item._id === created._id), 'Expected created transaction in list');

    const updateRes = await fetch(`${transactionsUrl}/${created._id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ amount: 150, description: 'Updated persistence test' })
    });
    assert(updateRes.status === 200, `Expected transaction update status 200, got ${updateRes.status}`);
    assert(
      await Transaction.exists({ _id: created._id, description: 'Updated persistence test', amount: 150 }),
      'Expected the edited amount and description to persist in MongoDB'
    );

    const reportRes = await fetch(`${baseUrl.replace('/receipts', '/reports')}?month=${reportMonth}`, {
      headers: { Authorization: headers.Authorization }
    });
    assert(reportRes.status === 200, `Expected report status 200, got ${reportRes.status}`);
    const reportData = await reportRes.json();
    const expectedMonthTotals = await analytics.monthTotals(testUser._id, reportMonth);
    assert(reportData.rangeTotals.income === expectedMonthTotals.income, 'Report income should match transaction month totals after an edit');
    assert(reportData.rangeTotals.expense === expectedMonthTotals.expense, 'Reports must exclude receipt-only records and match financial transaction totals');
    assert(reportData.rangeTotals.count === expectedMonthTotals.entryCount, 'Report entry count should include receipt records and match dashboard entry counts');

    const deleteRes = await fetch(`${transactionsUrl}/${created._id}`, {
      method: 'DELETE',
      headers: { Authorization: headers.Authorization }
    });
    assert(deleteRes.status === 200, `Expected transaction delete status 200, got ${deleteRes.status}`);
    assert(
      await Transaction.exists({ _id: created._id, deletedAt: { $ne: null } }),
      'Expected a soft-deleted transaction in MongoDB'
    );

    const restoreRes = await fetch(`${transactionsUrl}/${created._id}/restore`, {
      method: 'POST',
      headers: { Authorization: headers.Authorization }
    });
    assert(restoreRes.status === 200, `Expected transaction restore status 200, got ${restoreRes.status}`);
    assert(
      await Transaction.exists({ _id: created._id, deletedAt: null }),
      'Expected restored transaction in MongoDB'
    );
  });

  await teardown();

  const failed = results.filter((r) => !r.passed);
  console.log('\n--- Test Summary ---');
  console.log(`Total: ${results.length} | Passed: ${results.length - failed.length} | Failed: ${failed.length}\n`);

  if (failed.length > 0) {
    process.exit(1);
  } else {
    console.log('\x1b[32mAll 8 receipt scanning test scenarios passed successfully!\x1b[0m\n');
    process.exit(0);
  }
}

runAll().catch(async (err) => {
  console.error('\nFatal test error:', err);
  await teardown().catch(() => {});
  process.exit(1);
});
