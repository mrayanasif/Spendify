const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const Budget = require('../models/Budget');
const MerchantMapping = require('../models/MerchantMapping');
const ActivityLog = require('../models/ActivityLog');
const ApiError = require('../utils/ApiError');
const vision = require('../services/vision');
const categorizer = require('../services/categorizer');
const analytics = require('../services/analytics');
const { checkBudgetAlerts, getBudgetWarnings } = require('../services/budgetAlerts');
const { monthKey } = require('../utils/dates');

/** App palette colors and icons for auto-created categories */
const BRAND_COLORS = ['#BE123C', '#881337', '#F59E0B', '#16A34A', '#3B82F6', '#8B5CF6'];
const CATEGORY_ICON_MAP = {
  groceries: 'bowl',
  food: 'bowl',
  canteen: 'bowl',
  dining: 'bowl',
  transport: 'bus',
  travel: 'bus',
  transit: 'bus',
  books: 'book',
  academics: 'book',
  stationery: 'book',
  subscriptions: 'repeat',
  entertainment: 'ticket',
  hostel: 'home',
  rent: 'home',
  shopping: 'gift',
  health: 'award',
  pharmacy: 'award',
  medical: 'award'
};

/** Common synonym mappings to match receipt merchant / suggestions to standard categories */
const SYNONYMS = [
  {
    target: 'Food',
    words: ['food', 'grocery', 'groceries', 'supermarket', 'mart', 'super market', 'canteen', 'cafe', 'restaurant', 'bakery', 'imtiaz', 'dining', 'snack', 'mess']
  },
  {
    target: 'Transport',
    words: ['transport', 'transit', 'bus', 'train', 'metro', 'fuel', 'petrol', 'diesel', 'taxi', 'cab', 'uber', 'careem', 'fare']
  },
  {
    target: 'Academics',
    words: ['academics', 'books', 'book', 'stationery', 'textbook', 'photocopy', 'xerox', 'print', 'tuition', 'course', 'pen', 'paper']
  },
  {
    target: 'Hostel/Rent',
    words: ['hostel', 'rent', 'room', 'utility', 'electricity', 'gas', 'water bill', 'maintenance']
  },
  {
    target: 'Subscriptions',
    words: ['subscription', 'netflix', 'spotify', 'youtube', 'prime', 'membership', 'recharge']
  },
  {
    target: 'Entertainment',
    words: ['entertainment', 'movie', 'cinema', 'game', 'gaming', 'outing', 'party', 'concert']
  }
];

/**
 * Strips HTML and dangerous characters to prevent XSS.
 */
function sanitizeText(str = '', maxLength = 160) {
  return String(str)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Normalizes merchant name for lookup.
 */
function normalizeMerchant(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Category resolution logic:
 * 1. Checks MerchantMapping memory for this user.
 * 2. Matches against user's categories (default + personal) via exact match or synonyms.
 * 3. If no match exists, creates a new personal category for this user.
 */
async function resolveCategory(userId, suggestedCategoryName, merchantName) {
  const normMerchant = normalizeMerchant(merchantName);

  // 1. Check merchant mapping memory
  if (normMerchant) {
    const mapping = await MerchantMapping.findOne({ user: userId, merchant: normMerchant })
      .populate('category')
      .lean();
    if (mapping?.category && !mapping.category.isArchived) {
      return { category: mapping.category, isNew: false, matchedBy: 'merchant_memory' };
    }
  }

  // 2. Fetch all active categories visible to this user
  const userCategories = await Category.find({
    ...categorizer.visibleCategoryFilter(userId),
    type: 'expense'
  }).lean();

  const cleanSuggest = (suggestedCategoryName || '').toLowerCase().trim();
  const searchCorpus = `${cleanSuggest} ${normMerchant}`.toLowerCase();

  // 2a. Direct exact or substring match with existing category names
  for (const cat of userCategories) {
    const catNameLower = cat.name.toLowerCase().trim();
    if (catNameLower === cleanSuggest || cleanSuggest.includes(catNameLower) || catNameLower.includes(cleanSuggest)) {
      return { category: cat, isNew: false, matchedBy: 'direct_match' };
    }
  }

  // 2b. Synonym match
  for (const group of SYNONYMS) {
    const hit = group.words.some((w) => searchCorpus.includes(w));
    if (hit) {
      const match = userCategories.find((c) => c.name.toLowerCase() === group.target.toLowerCase());
      if (match) {
        return { category: match, isNew: false, matchedBy: 'synonym' };
      }
    }
  }

  // 2c. If suggested category is missing or generic, ask categorizer assistant
  if (!cleanSuggest || cleanSuggest === 'miscellaneous' || cleanSuggest === 'other') {
    const assistantSuggestion = await categorizer.suggestCategory(userId, `${merchantName} ${suggestedCategoryName}`);
    if (assistantSuggestion?.categoryId) {
      const match = userCategories.find((c) => c._id.toString() === assistantSuggestion.categoryId.toString());
      if (match) {
        return { category: match, isNew: false, matchedBy: 'assistant' };
      }
    }
  }

  // 3. None matches -> create NEW category for this user
  let newName = sanitizeText(suggestedCategoryName || 'Groceries', 40);
  if (!newName || newName.length < 3) newName = 'Groceries';
  // Capitalize first letter
  newName = newName.charAt(0).toUpperCase() + newName.slice(1);

  // Check race condition: already created?
  let existingNew = await Category.findOne({
    owner: userId,
    type: 'expense',
    name: new RegExp(`^${newName}$`, 'i'),
    isArchived: false
  });

  if (existingNew) {
    return { category: existingNew, isNew: false, matchedBy: 'existing_personal' };
  }

  // Determine icon & color
  const lowerKey = newName.toLowerCase();
  const icon = Object.keys(CATEGORY_ICON_MAP).find((k) => lowerKey.includes(k))
    ? CATEGORY_ICON_MAP[Object.keys(CATEGORY_ICON_MAP).find((k) => lowerKey.includes(k))]
    : 'bowl';

  const colorIndex = Math.abs(newName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % BRAND_COLORS.length;
  const color = BRAND_COLORS[colorIndex];

  try {
    const created = await Category.create({
      name: newName,
      type: 'expense',
      icon,
      color,
      isDefault: false,
      owner: userId
    });
    return { category: created, isNew: true, matchedBy: 'created_new' };
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate race condition
      const found = await Category.findOne({ owner: userId, type: 'expense', name: newName });
      if (found) return { category: found, isNew: false, matchedBy: 'race_recovery' };
    }
    throw err;
  }
}

/**
 * Checks if a probable duplicate expense already exists within 24 hours.
 */
async function checkDuplicate(userId, amount, date, merchant) {
  const targetDate = new Date(date);
  const start = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
  const end = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

  const candidates = await Transaction.find({
    user: userId,
    type: 'expense',
    amount: {
      $gte: analytics.round(amount - 0.01),
      $lte: analytics.round(amount + 0.01)
    },
    deletedAt: null,
    date: { $gte: start, $lte: end }
  })
    .populate('category', 'name color icon')
    .lean();

  const normalizedMerchant = normalizeMerchant(merchant);
  const duplicate = candidates.find((candidate) => {
    const existingMerchant = normalizeMerchant(candidate.receiptData?.merchant || candidate.description);
    return !normalizedMerchant || !existingMerchant ||
      normalizedMerchant === existingMerchant ||
      normalizedMerchant.includes(existingMerchant) ||
      existingMerchant.includes(normalizedMerchant);
  }) || null;
  if (duplicate) {
    await Transaction.updateOne(
      { _id: duplicate._id, user: userId },
      { $set: { receiptDuplicateDetected: true, 'flags.possibleDuplicate': true } }
    );
  }
  return duplicate;
}

/**
 * POST /api/receipts/scan
 * Uploads an image, extracts fields via Vision AI, resolves category,
 * detects duplicates, and auto-adds or flags for review.
 */
async function scanReceipt(req, res) {
  if (!req.file || !req.file.buffer) {
    throw ApiError.badRequest('Please upload or capture a receipt photo.');
  }

  const mimeType = req.file.mimetype;
  if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(mimeType)) {
    throw ApiError.badRequest('Invalid file format. Please upload an image (JPEG, PNG, or WebP).');
  }

  // 1. Run Vision AI extraction
  let extracted;
  try {
    extracted = await vision.extractReceipt(req.file.buffer, mimeType);
  } catch (err) {
    return res.status(422).json({
      status: 'unreadable',
      message: err.message || "Couldn't read this receipt, please try a clearer photo or enter it manually.",
      partial: null
    });
  }

  // 2. Validate strict rules
  const amount = Number(extracted?.total);
  if (!extracted?.isReceipt || !Number.isFinite(amount) || amount <= 0) {
    return res.status(422).json({
      status: 'unreadable',
      message: "Couldn't read this receipt, please try a clearer photo or enter it manually.",
      partial: {
        merchant: sanitizeText(extracted?.merchant),
        date: extracted?.date,
        currency: extracted?.currency,
        suggestedCategory: sanitizeText(extracted?.suggestedCategory)
      }
    });
  }

  // Validate date: cannot be in the future
  let validDate = new Date(extracted.date || new Date());
  if (Number.isNaN(validDate.getTime())) validDate = new Date();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (validDate > today) {
    validDate = new Date();
    extracted.confidence.date = 0.5;
  }
  const dateStr = validDate.toISOString().slice(0, 10);

  const cleanMerchant = sanitizeText(extracted.merchant || 'Receipt Expense', 120);

  // 3. Resolve category
  const { category, isNew, matchedBy } = await resolveCategory(
    req.user._id,
    extracted.suggestedCategory,
    cleanMerchant
  );

  // 4. Duplicate check
  const duplicate = await checkDuplicate(req.user._id, amount, validDate, cleanMerchant);
  if (duplicate) {
    return res.json({
      status: 'duplicate_detected',
      message: 'This looks like a receipt you already added. Add anyway?',
      duplicate: {
        id: duplicate._id,
        amount: duplicate.amount,
        date: duplicate.date,
        description: duplicate.description,
        categoryName: duplicate.category?.name
      },
      extracted: {
        merchant: cleanMerchant,
        date: dateStr,
        amount: analytics.round(amount),
        currency: extracted.currency || 'PKR',
        lineItems: extracted.lineItems || [],
        suggestedCategory: category.name,
        confidence: extracted.confidence
      },
      category: {
        _id: category._id,
        name: category.name,
        color: category.color,
        icon: category.icon
      },
      isNewCategory: isNew,
      matchedBy
    });
  }

  // 5. Confidence check
  const confAmount = extracted.confidence?.amount ?? 0;
  const confDate = extracted.confidence?.date ?? 0;
  const isHighConfidence = confAmount >= 0.8 && confDate >= 0.8;

  if (!isHighConfidence) {
    return res.json({
      status: 'review_required',
      message: 'Confidence is below 80%. Please review the extracted details before saving.',
      extracted: {
        merchant: cleanMerchant,
        date: dateStr,
        amount: analytics.round(amount),
        currency: extracted.currency || 'PKR',
        lineItems: extracted.lineItems || [],
        suggestedCategory: category.name,
        confidence: extracted.confidence
      },
      category: {
        _id: category._id,
        name: category.name,
        color: category.color,
        icon: category.icon
      },
      isNewCategory: isNew,
      matchedBy
    });
  }

  // 6. High confidence & no duplicate -> AUTO-ADD!
  const transaction = await Transaction.create({
    user: req.user._id,
    type: 'expense',
    amount: analytics.round(amount),
    category: category._id,
    description: cleanMerchant,
    note: extracted.lineItems?.length ? `${extracted.lineItems.length} items scanned` : '',
    date: validDate,
    source: 'receipt_scan',
    receiptData: {
      merchant: cleanMerchant,
      currency: extracted.currency || 'PKR',
      lineItems: extracted.lineItems || [],
      confidence: extracted.confidence
    }
  });

  // Remember merchant -> category mapping
  const normMerchant = normalizeMerchant(cleanMerchant);
  if (normMerchant) {
    await MerchantMapping.findOneAndUpdate(
      { user: req.user._id, merchant: normMerchant },
      { category: category._id },
      { upsert: true, new: true }
    );
  }

  // Learn words for categorizer
  await categorizer.learnFromTransaction(req.user._id, cleanMerchant, category._id);
  await analytics.refreshAnomalyFlags(req.user._id);

  // Check budget alerts
  const mKey = monthKey(validDate);
  const budgetAlerts = await checkBudgetAlerts(req.user, mKey);
  const budgetWarnings = budgetAlerts.map((alert) => ({
    type: 'budget_alert',
    level: alert.level,
    message: `${alert.title}. ${alert.body}`
  }));
  if (!budgetWarnings.some((warning) => warning.level === 'danger')) {
    budgetWarnings.push(...await getBudgetWarnings(req.user, mKey, category._id));
  }

  await ActivityLog.create({
    user: req.user._id,
    transaction: transaction._id,
    action: 'created',
    snapshot: {
      amount: transaction.amount,
      description: transaction.description,
      source: 'receipt_scan'
    }
  });

  const saved = await Transaction.findById(transaction._id).populate('category', 'name color icon type');

  return res.status(201).json({
    status: 'auto_added',
    message: `Added Rs ${analytics.round(amount)} to ${category.name} (${cleanMerchant})`,
    transaction: saved,
    createdCategoryId: isNew ? category._id : null,
    alerts: budgetAlerts.length,
    warnings: budgetWarnings,
    extracted: {
      merchant: cleanMerchant,
      date: dateStr,
      amount: analytics.round(amount),
      currency: extracted.currency || 'PKR',
      lineItems: extracted.lineItems || [],
      confidence: extracted.confidence
    }
  });
}

/**
 * POST /api/receipts/confirm
 * Explicitly confirms and creates an expense after user review or on duplicate override.
 */
async function confirmReceipt(req, res) {
  const { amount, date, merchant, note = '', lineItems = [], confidence = {} } = req.body;
  const categoryId = req.body.category || req.body.categoryId;

  const value = Number(amount);
  if (!value || value <= 0) throw ApiError.badRequest('Enter a valid amount greater than zero.');
  if (!categoryId) throw ApiError.badRequest('Category is required.');

  // Validate category ownership
  const category = await Category.findOne({
    _id: categoryId,
    type: 'expense',
    isArchived: false,
    $or: [{ owner: req.user._id }, { isDefault: true, owner: null }]
  });
  if (!category) throw ApiError.badRequest('Choose a valid category.');

  let when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) when = new Date();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (when > today) when = new Date();

  const cleanMerchant = sanitizeText(merchant || 'Receipt Expense', 120);

  const transaction = await Transaction.create({
    user: req.user._id,
    type: 'expense',
    amount: analytics.round(value),
    category: category._id,
    description: cleanMerchant,
    note: sanitizeText(note, 400),
    date: when,
    source: 'receipt_scan',
    receiptData: {
      merchant: cleanMerchant,
      currency: req.body.currency || 'PKR',
      lineItems: Array.isArray(lineItems) ? lineItems : [],
      confidence: {
        amount: Number(confidence.amount || 1),
        date: Number(confidence.date || 1),
        category: Number(confidence.category || 1)
      }
    }
  });

  // Update merchant mapping
  const normMerchant = normalizeMerchant(cleanMerchant);
  if (normMerchant) {
    await MerchantMapping.findOneAndUpdate(
      { user: req.user._id, merchant: normMerchant },
      { category: category._id },
      { upsert: true, new: true }
    );
  }

  await categorizer.learnFromTransaction(req.user._id, cleanMerchant, category._id);
  await analytics.refreshAnomalyFlags(req.user._id);

  const mKey = monthKey(when);
  const budgetAlerts = await checkBudgetAlerts(req.user, mKey);
  const budgetWarnings = budgetAlerts.map((alert) => ({
    type: 'budget_alert',
    level: alert.level,
    message: `${alert.title}. ${alert.body}`
  }));
  if (!budgetWarnings.some((warning) => warning.level === 'danger')) {
    budgetWarnings.push(...await getBudgetWarnings(req.user, mKey, category._id));
  }

  await ActivityLog.create({
    user: req.user._id,
    transaction: transaction._id,
    action: 'created',
    snapshot: { amount: transaction.amount, description: transaction.description, source: 'receipt_scan' }
  });

  const saved = await Transaction.findById(transaction._id).populate('category', 'name color icon type');
  res.status(201).json({
    status: 'confirmed',
    message: `Saved Rs ${analytics.round(value)} to ${category.name} (${cleanMerchant})`,
    transaction: saved,
    alerts: budgetAlerts.length,
    warnings: budgetWarnings
  });
}

/**
 * POST /api/receipts/undo
 * Undoes an auto-added receipt scan:
 * - Deletes the transaction
 * - If this scan created a new category that has NO other expenses, deletes that category too!
 */
async function undoReceipt(req, res) {
  const { transactionId, createdCategoryId } = req.body;
  if (!transactionId) throw ApiError.badRequest('Transaction ID is required.');

  const transaction = await Transaction.findOne({ _id: transactionId, user: req.user._id });
  if (!transaction) throw ApiError.notFound('Transaction not found or already deleted.');

  // Hard or soft delete transaction
  await Transaction.deleteOne({ _id: transaction._id, user: req.user._id });

  let categoryRemoved = false;
  const catToCheck = createdCategoryId || transaction.category;
  if (catToCheck) {
    // Check if category has any other transactions
    const remainingCount = await Transaction.countDocuments({
      category: catToCheck,
      user: req.user._id
    });

    const hasBudget = await Budget.exists({ user: req.user._id, category: catToCheck });
    if (remainingCount === 0 && !hasBudget) {
      // Delete the empty auto-created category
      const del = await Category.deleteOne({
        _id: catToCheck,
        owner: req.user._id,
        isDefault: false
      });
      if (del.deletedCount > 0) categoryRemoved = true;
    }
  }

  await analytics.refreshAnomalyFlags(req.user._id);

  res.json({
    undone: true,
    categoryRemoved,
    message: categoryRemoved
      ? 'Expense undone and newly created empty category removed.'
      : 'Expense undone successfully.'
  });
}

/**
 * POST /api/receipts/check-duplicate
 * Lightweight duplicate check used by the frontend-only OCR path.
 */
async function checkReceiptDuplicate(req, res) {
  const { merchant, amount, date } = req.body;
  const value = Number(amount);
  if (!value || value <= 0) return res.json({ isDuplicate: false });

  const targetDate = date && !Number.isNaN(new Date(date).getTime()) ? new Date(date) : new Date();
  const existing = await checkDuplicate(req.user._id, value, targetDate, merchant);

  if (existing) {
    return res.json({
      isDuplicate: true,
      existing: {
        _id: existing._id,
        amount: existing.amount,
        date: existing.date,
        description: existing.description || existing.category?.name,
        categoryName: existing.category?.name,
      },
    });
  }

  res.json({ isDuplicate: false });
}

module.exports = {
  scanReceipt,
  confirmReceipt,
  undoReceipt,
  checkReceiptDuplicate
};
