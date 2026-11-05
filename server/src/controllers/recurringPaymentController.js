const RecurringPayment = require('../models/RecurringPayment');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const { startOfDay } = require('../utils/dates');
const { advance } = require('../services/recurring');

const FREQUENCIES = ['weekly', 'monthly', 'yearly'];

async function ownedCategory(userId, categoryId, type) {
  const category = await Category.findOne({
    _id: categoryId,
    type,
    isArchived: false,
    $or: [{ owner: userId }, { isDefault: true, owner: null }]
  });
  if (!category) throw ApiError.badRequest(`Choose a valid ${type} category.`);
  return category;
}

function parseDate(value, label, nullable = false) {
  if ((value === null || value === '') && nullable) return null;
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw ApiError.badRequest(`Choose a valid ${label}.`);
  return startOfDay(parsed);
}

function validateAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw ApiError.badRequest('Enter an amount greater than zero.');
  return Math.round(amount * 100) / 100;
}

function validateFrequency(value) {
  if (!FREQUENCIES.includes(value)) throw ApiError.badRequest('Choose weekly, monthly, or yearly.');
  return value;
}

async function listRecurringPayments(req, res) {
  const items = await RecurringPayment.find({ user: req.user._id })
    .populate('category', 'name color icon type')
    .sort({ active: -1, nextRunOn: 1, name: 1 })
    .lean();
  res.json({ items });
}

async function createRecurringPayment(req, res) {
  const { name, description = '', type = 'expense', category, amount, frequency = 'monthly' } = req.body;
  const cleanName = String(name || '').trim();
  if (!cleanName) throw ApiError.badRequest('Enter a name for this recurring payment.');
  if (cleanName.length > 100) throw ApiError.badRequest('The name must be 100 characters or fewer.');
  if (!['expense', 'income'].includes(type)) throw ApiError.badRequest('Choose expense or income.');
  const startDate = parseDate(req.body.startDate, 'a start date');
  const endDate = parseDate(req.body.endDate, 'an end date', true);
  if (endDate && endDate < startDate) throw ApiError.badRequest('The end date must be on or after the start date.');
  await ownedCategory(req.user._id, category, type);

  const item = await RecurringPayment.create({
    user: req.user._id,
    name: cleanName,
    description: String(description).trim().slice(0, 400),
    type,
    category,
    amount: validateAmount(amount),
    frequency: validateFrequency(frequency),
    startDate,
    endDate,
    nextRunOn: startDate,
    active: true
  });
  const saved = await RecurringPayment.findById(item._id).populate('category', 'name color icon type').lean();
  res.status(201).json({ item: saved, message: 'Recurring payment saved.' });
}

async function updateRecurringPayment(req, res) {
  const item = await RecurringPayment.findOne({ _id: req.params.id, user: req.user._id });
  if (!item) throw ApiError.notFound('Recurring payment not found.');

  const oldFrequency = item.frequency;
  const oldStart = item.startDate.getTime();
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw ApiError.badRequest('Enter a name for this recurring payment.');
    if (name.length > 100) throw ApiError.badRequest('The name must be 100 characters or fewer.');
    item.name = name;
  }
  if (req.body.description !== undefined) item.description = String(req.body.description).trim().slice(0, 400);
  if (req.body.type !== undefined) {
    if (!['expense', 'income'].includes(req.body.type)) throw ApiError.badRequest('Choose expense or income.');
    item.type = req.body.type;
  }
  if (req.body.category !== undefined) item.category = req.body.category;
  if (req.body.amount !== undefined) item.amount = validateAmount(req.body.amount);
  if (req.body.frequency !== undefined) item.frequency = validateFrequency(req.body.frequency);
  if (req.body.startDate !== undefined) item.startDate = parseDate(req.body.startDate, 'a start date');
  if (req.body.endDate !== undefined) item.endDate = parseDate(req.body.endDate, 'an end date', true);
  if (item.endDate && item.endDate < item.startDate) {
    throw ApiError.badRequest('The end date must be on or after the start date.');
  }
  if (req.body.category !== undefined || req.body.type !== undefined) {
    await ownedCategory(req.user._id, item.category, item.type);
  }
  if (item.frequency !== oldFrequency || item.startDate.getTime() !== oldStart) {
    item.nextRunOn = item.startDate;
  }
  if (item.endDate && item.nextRunOn > item.endDate) item.active = false;

  await item.save();
  const saved = await RecurringPayment.findById(item._id).populate('category', 'name color icon type').lean();
  res.json({ item: saved, message: 'Recurring payment updated.' });
}

async function setRecurringPaymentStatus(req, res) {
  const item = await RecurringPayment.findOne({ _id: req.params.id, user: req.user._id });
  if (!item) throw ApiError.notFound('Recurring payment not found.');
  if (typeof req.body.active !== 'boolean') throw ApiError.badRequest('Choose whether to pause or resume this payment.');
  if (req.body.active && !item.active) {
    const today = startOfDay(new Date());
    let next = startOfDay(item.nextRunOn);
    let guard = 0;
    while (next <= today && guard < 120) {
      next = advance(next, item.frequency);
      guard += 1;
    }
    if (item.endDate && next > startOfDay(item.endDate)) {
      throw ApiError.badRequest('This recurring payment has passed its end date and cannot be resumed. Edit the dates first.');
    }
    item.nextRunOn = next;
  }
  item.active = req.body.active;
  await item.save();
  res.json({ item, message: item.active ? 'Recurring payment resumed.' : 'Recurring payment paused.' });
}

async function deleteRecurringPayment(req, res) {
  const item = await RecurringPayment.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!item) throw ApiError.notFound('Recurring payment not found.');
  res.json({ message: 'Recurring payment deleted. Past transactions are kept.' });
}

module.exports = {
  listRecurringPayments,
  createRecurringPayment,
  updateRecurringPayment,
  setRecurringPaymentStatus,
  deleteRecurringPayment
};
