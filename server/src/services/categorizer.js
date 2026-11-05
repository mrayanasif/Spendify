const Category = require('../models/Category');
const CategoryHint = require('../models/CategoryHint');
const { KEYWORD_MAP } = require('../config/defaults');

/**
 * Expense categorisation assistant.
 *
 * Scoring is deliberately simple and fully local — no external service, no API
 * key, and every number is explainable:
 *
 *   score(category) = 3 x (learned weight for this student's words)
 *                   + 1 x (starter keyword matches)
 *                   + 0.5 x (exact phrase appears in the category name)
 *
 * The learned part comes from `CategoryHint`, which is updated every time the
 * student saves a transaction. That is what "learns from corrections over time"
 * means here: an override immediately reweights the words involved.
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'for', 'and', 'of', 'to', 'in', 'on', 'at', 'with', 'my',
  'from', 'paid', 'pay', 'bought', 'buy', 'this', 'that', 'was', 'were', 'is'
]);

/** Lower-cases, drops punctuation, digits and stop words. */
function tokenize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

/** Categories a student may use: their own plus the system defaults. */
function visibleCategoryFilter(userId) {
  return { $or: [{ owner: userId }, { isDefault: true, owner: null }], isArchived: false };
}

/**
 * Suggests a category for a description.
 * Returns `{ categoryId, categoryName, confidence, reason }` or null when
 * nothing scores above the floor — a weak guess is worse than no guess.
 */
async function suggestCategory(userId, description, type = 'expense') {
  const tokens = tokenize(description);
  if (!tokens.length) return null;

  const categories = await Category.find({ ...visibleCategoryFilter(userId), type }).lean();
  if (!categories.length) return null;

  const byId = new Map(categories.map((c) => [c._id.toString(), c]));
  const scores = new Map();
  const matchedWords = new Map();

  const bump = (categoryId, amount, word) => {
    const id = categoryId.toString();
    if (!byId.has(id)) return;
    scores.set(id, (scores.get(id) || 0) + amount);
    if (word) {
      const list = matchedWords.get(id) || new Set();
      list.add(word);
      matchedWords.set(id, list);
    }
  };

  // 1. What this student has taught us.
  const hints = await CategoryHint.find({ user: userId, token: { $in: tokens } }).lean();
  for (const hint of hints) {
    bump(hint.category, 3 * hint.weight, hint.token);
  }

  // 2. Starter vocabulary, matched against category names.
  for (const category of categories) {
    const keywords = KEYWORD_MAP[category.name] || [];
    for (const keyword of keywords) {
      const parts = keyword.split(' ');
      const hit = parts.length > 1
        ? description.toLowerCase().includes(keyword)
        : tokens.includes(keyword);
      if (hit) bump(category._id, 1, keyword);
    }

    // 3. The description naming the category outright ("hostel rent june").
    const nameWords = tokenize(category.name);
    for (const word of nameWords) {
      if (tokens.includes(word)) bump(category._id, 0.5, word);
    }
  }

  if (!scores.size) return null;

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [topId, topScore] = ranked[0];
  const runnerUp = ranked[1] ? ranked[1][1] : 0;

  if (topScore < 1) return null;

  // Confidence grows with the lead over the runner-up, capped at 0.95 so the UI
  // never presents a suggestion as certain.
  const lead = (topScore - runnerUp) / topScore;
  const confidence = Math.min(0.95, 0.45 + lead * 0.5);

  const category = byId.get(topId);
  const words = [...(matchedWords.get(topId) || [])].slice(0, 3);

  return {
    categoryId: category._id,
    categoryName: category.name,
    color: category.color,
    icon: category.icon,
    confidence: Number(confidence.toFixed(2)),
    reason: words.length ? `matched "${words.join('", "')}"` : 'based on your past entries'
  };
}

/**
 * Feeds a confirmed transaction back into the model.
 * The chosen category gains weight on every word; when the student overrode a
 * suggestion, the rejected category loses a little so it stops winning.
 */
async function learnFromTransaction(userId, description, chosenCategoryId, rejectedCategoryId = null) {
  const tokens = [...new Set(tokenize(description))];
  if (!tokens.length || !chosenCategoryId) return;

  const ops = tokens.map((token) => ({
    updateOne: {
      filter: { user: userId, token, category: chosenCategoryId },
      update: { $inc: { weight: 1 }, $setOnInsert: { user: userId, token, category: chosenCategoryId } },
      upsert: true
    }
  }));

  if (rejectedCategoryId && rejectedCategoryId.toString() !== chosenCategoryId.toString()) {
    for (const token of tokens) {
      ops.push({
        updateOne: {
          filter: { user: userId, token, category: rejectedCategoryId, weight: { $gt: 0 } },
          update: { $inc: { weight: -0.5 } }
        }
      });
    }
  }

  await CategoryHint.bulkWrite(ops, { ordered: false });
}

/** Batch variant used by the CSV importer so one DB read serves every row. */
async function suggestForRows(userId, rows) {
  const results = [];
  for (const row of rows) {
    // Sequential on purpose: each call reads the hints table, and import sizes
    // here are small enough that clarity beats concurrency.
    results.push(await suggestCategory(userId, row.description, row.type || 'expense'));
  }
  return results;
}

module.exports = { suggestCategory, learnFromTransaction, suggestForRows, tokenize, visibleCategoryFilter };
