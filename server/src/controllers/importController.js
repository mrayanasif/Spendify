const { parse } = require('csv-parse/sync');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const ActivityLog = require('../models/ActivityLog');
const ApiError = require('../utils/ApiError');
const categorizer = require('../services/categorizer');
const analytics = require('../services/analytics');
const { checkBudgetAlerts } = require('../services/budgetAlerts');
const { monthKey } = require('../utils/dates');

/**
 * CSV import, in two steps.
 *
 * 1. `preview` parses the upload, normalises the columns, and asks the
 *    categorisation assistant for a batch of suggestions. Nothing is saved.
 * 2. `commit` writes the rows the student confirmed, after they have had the
 *    chance to change any category.
 *
 * Header names are matched loosely so a file exported from a bank or a
 * spreadsheet usually lines up without editing.
 */

const COLUMN_ALIASES = {
  date: ['date', 'transaction date', 'txn date', 'posted', 'day'],
  description: ['description', 'details', 'narration', 'particulars', 'note', 'memo', 'merchant', 'title'],
  amount: ['amount', 'value', 'debit', 'credit', 'sum', 'total'],
  type: ['type', 'kind', 'direction', 'dr/cr'],
  category: ['category', 'group', 'tag']
};

function normaliseHeader(header) {
  const clean = String(header || '').trim().toLowerCase();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(clean)) return field;
  }
  return clean;
}

function parseAmount(raw) {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).replace(/[^0-9.\-()]/g, '').trim();
  if (!text) return null;
  // Accounting style "(120.50)" means a negative number.
  const negative = /^\(.*\)$/.test(String(raw).trim());
  const value = Number(text.replace(/[()]/g, ''));
  if (Number.isNaN(value)) return null;
  return negative ? -Math.abs(value) : value;
}

function parseDate(raw) {
  if (!raw) return null;
  const text = String(raw).trim();

  // Accept dd/mm/yyyy and dd-mm-yyyy, which Date() reads as US order otherwise.
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** POST /api/import/preview (multipart: `file`, or JSON `{ csv }`) */
async function preview(req, res) {
  const raw = req.file ? req.file.buffer.toString('utf8') : req.body.csv;
  if (!raw?.trim()) throw ApiError.badRequest('Upload a CSV file, or paste its contents.');

  let records;
  try {
    records = parse(raw, {
      columns: (header) => header.map(normaliseHeader),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true
    });
  } catch (err) {
    throw ApiError.badRequest(`That file could not be read as CSV: ${err.message}`);
  }

  if (!records.length) throw ApiError.badRequest('The file has a header but no rows.');
  if (records.length > 1000) throw ApiError.badRequest('Please import at most 1000 rows at a time.');

  const categories = await Category.find(categorizer.visibleCategoryFilter(req.user._id)).lean();
  const byName = new Map(categories.map((c) => [`${c.type}:${c.name.toLowerCase()}`, c]));

  const rows = [];
  const skipped = [];

  records.forEach((record, index) => {
    const lineNumber = index + 2; // +1 for the header, +1 for 1-based counting
    const amount = parseAmount(record.amount);
    const date = parseDate(record.date);
    const description = String(record.description || '').trim();

    if (amount === null || amount === 0) {
      skipped.push({ line: lineNumber, reason: 'no usable amount', raw: record });
      return;
    }
    if (!date) {
      skipped.push({ line: lineNumber, reason: 'no usable date', raw: record });
      return;
    }

    // Type comes from the column if present, otherwise from the sign.
    let type = String(record.type || '').trim().toLowerCase();
    if (['income', 'credit', 'cr', 'in', 'deposit'].includes(type)) type = 'income';
    else if (['expense', 'debit', 'dr', 'out', 'withdrawal'].includes(type)) type = 'expense';
    else type = amount < 0 ? 'expense' : 'income';

    // A file with only positive numbers and no type column is almost always spending.
    if (!record.type && amount > 0 && !/salary|allowance|scholarship|refund|gift/i.test(description)) {
      type = 'expense';
    }

    rows.push({
      line: lineNumber,
      date,
      description,
      amount: Math.abs(amount),
      type,
      namedCategory: String(record.category || '').trim()
    });
  });

  if (!rows.length) {
    throw ApiError.badRequest('No rows in that file had both a date and an amount we could read.');
  }

  // Batch categorisation: an explicit category column wins, otherwise the assistant suggests.
  const suggestions = await categorizer.suggestForRows(
    req.user._id,
    rows.map((r) => ({ description: r.description, type: r.type }))
  );

  const prepared = rows.map((row, i) => {
    const named = row.namedCategory ? byName.get(`${row.type}:${row.namedCategory.toLowerCase()}`) : null;
    const suggestion = suggestions[i];
    const fallback = categories.find((c) => c.type === row.type && /other|miscellaneous/i.test(c.name)) ||
      categories.find((c) => c.type === row.type);

    const chosen = named
      ? { id: named._id, name: named.name, color: named.color, origin: 'file' }
      : suggestion
        ? { id: suggestion.categoryId, name: suggestion.categoryName, color: suggestion.color, origin: 'suggested' }
        : fallback
          ? { id: fallback._id, name: fallback.name, color: fallback.color, origin: 'fallback' }
          : null;

    return {
      ...row,
      date: row.date.toISOString().slice(0, 10),
      category: chosen,
      confidence: named ? 1 : suggestion?.confidence || 0,
      reason: named ? 'taken from the file' : suggestion?.reason || 'no strong match — please choose'
    };
  });

  res.json({
    rows: prepared,
    skipped,
    summary: {
      readable: prepared.length,
      skipped: skipped.length,
      income: prepared.filter((r) => r.type === 'income').length,
      expense: prepared.filter((r) => r.type === 'expense').length,
      needsReview: prepared.filter((r) => r.confidence < 0.6).length
    }
  });
}

/** POST /api/import/commit — writes the confirmed rows. */
async function commit(req, res) {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) throw ApiError.badRequest('There are no rows to import.');
  if (rows.length > 1000) throw ApiError.badRequest('Please import at most 1000 rows at a time.');

  const categories = await Category.find(categorizer.visibleCategoryFilter(req.user._id)).lean();
  const valid = new Map(categories.map((c) => [c._id.toString(), c]));

  const documents = [];
  const rejected = [];

  for (const row of rows) {
    const category = valid.get(String(row.categoryId));
    const amount = Number(row.amount);
    const date = new Date(row.date);

    if (!category || !amount || amount <= 0 || Number.isNaN(date.getTime())) {
      rejected.push({ line: row.line, reason: 'missing category, amount or date' });
      continue;
    }
    if (category.type !== row.type) {
      rejected.push({ line: row.line, reason: `category "${category.name}" is not an ${row.type} category` });
      continue;
    }

    documents.push({
      user: req.user._id,
      category: category._id,
      type: row.type,
      amount: analytics.round(amount),
      description: String(row.description || '').trim().slice(0, 160),
      date,
      source: 'csv'
    });
  }

  if (!documents.length) {
    throw ApiError.badRequest('None of those rows could be imported. Check the categories and amounts.');
  }

  const created = await Transaction.insertMany(documents);

  await ActivityLog.insertMany(
    created.map((t) => ({
      user: req.user._id,
      transaction: t._id,
      action: 'imported',
      snapshot: { amount: t.amount, description: t.description, date: t.date }
    }))
  );

  // Learn from every labelled row so the next import needs less correcting.
  for (const doc of documents) {
    if (doc.description) {
      await categorizer.learnFromTransaction(req.user._id, doc.description, doc.category);
    }
  }

  await analytics.refreshAnomalyFlags(req.user._id);
  await checkBudgetAlerts(req.user, monthKey());

  res.status(201).json({
    imported: created.length,
    rejected,
    message: `Imported ${created.length} transaction${created.length === 1 ? '' : 's'}.`
  });
}

/** GET /api/import/template — a sample file so the expected shape is obvious. */
function template(_req, res) {
  const csv = [
    'date,description,amount,type,category',
    '2026-09-02,Monthly allowance from home,400,income,Allowance',
    '2026-09-03,Campus Cafe lunch,6.50,expense,Food',
    '2026-09-04,Metro card top up,20,expense,Transport',
    '2026-09-05,Data structures textbook,45,expense,Academics',
    '2026-09-06,Streaming subscription,9.99,expense,Subscriptions'
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="spendify-template.csv"');
  res.send(csv);
}

module.exports = { preview, commit, template };
