const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const ApiError = require('../utils/ApiError');
const { visibleCategoryFilter } = require('../services/categorizer');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function throwOnDuplicateCategory(error, type, name) {
  if (error.code === 11000) {
    throw ApiError.conflict(`A ${type} category called "${name}" already exists.`);
  }
  throw error;
}

/** GET /api/categories — system defaults plus this student's own. */
async function listCategories(req, res) {
  const categories = await Category.find(visibleCategoryFilter(req.user._id))
    .sort({ type: 1, isDefault: -1, name: 1 })
    .lean();

  res.json({
    categories: categories.map((c) => ({ ...c, isOwn: Boolean(c.owner) })),
    income: categories.filter((c) => c.type === 'income'),
    expense: categories.filter((c) => c.type === 'expense')
  });
}

/** POST /api/categories — create a personal category. */
async function createCategory(req, res) {
  const { name, type, icon, color } = req.body;

  if (typeof name !== 'string' || !name.trim()) throw ApiError.badRequest('Give the category a name.');
  if (!['income', 'expense'].includes(type)) throw ApiError.badRequest('Choose income or expense.');

  const clean = name.trim();

  // Clash either with one of their own or with a system default.
  const clash = await Category.findOne({
    type,
    name: new RegExp(`^${escapeRegex(clean)}$`, 'i'),
    $or: [{ owner: req.user._id }, { isDefault: true, owner: null }]
  });
  if (clash) throw ApiError.conflict(`A ${type} category called "${clean}" already exists.`);

  let category;
  try {
    category = await Category.create({
      name: clean,
      type,
      icon: icon || 'dots',
      color: color || '#8a94a6',
      owner: req.user._id,
      isDefault: false
    });
  } catch (error) {
    throwOnDuplicateCategory(error, type, clean);
  }

  res.status(201).json({ category });
}

/** PUT /api/categories/:id — personal categories only. */
async function updateCategory(req, res) {
  const category = await Category.findOne({ _id: req.params.id, owner: req.user._id });
  if (!category) {
    throw ApiError.notFound('That category is not one of yours. System categories are managed by an administrator.');
  }

  const { name, icon, color } = req.body;
  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) throw ApiError.badRequest('Give the category a name.');
    const clash = await Category.findOne({
      _id: { $ne: category._id },
      type: category.type,
      name: new RegExp(`^${escapeRegex(clean)}$`, 'i'),
      $or: [{ owner: req.user._id }, { isDefault: true, owner: null }]
    });
    if (clash) throw ApiError.conflict(`A ${category.type} category called "${clean}" already exists.`);
    category.name = clean;
  }
  if (icon !== undefined) category.icon = icon;
  if (color !== undefined) category.color = color;

  try {
    await category.save();
  } catch (error) {
    throwOnDuplicateCategory(error, category.type, category.name);
  }
  res.json({ category });
}

/**
 * DELETE /api/categories/:id
 * Refuses while transactions still point at it, so history can never lose its
 * label. `?reassignTo=<id>` moves them across first.
 */
async function deleteCategory(req, res) {
  const category = await Category.findOne({ _id: req.params.id, owner: req.user._id });
  if (!category) {
    throw ApiError.notFound('That category is not one of yours. System categories are managed by an administrator.');
  }

  const inUse = await Transaction.countDocuments({ category: category._id, user: req.user._id });

  if (inUse > 0) {
    const { reassignTo } = req.query;
    if (!reassignTo) {
      throw ApiError.conflict(
        `${inUse} transaction${inUse === 1 ? '' : 's'} still use this category. ` +
          'Pick another category to move them to before deleting.'
      );
    }

    const target = await Category.findOne({
      _id: reassignTo,
      type: category.type,
      isArchived: false,
      $or: [{ owner: req.user._id }, { isDefault: true, owner: null }]
    });
    if (!target || target._id.equals(category._id)) {
      throw ApiError.badRequest('Choose a different replacement category of the same type.');
    }

    await Transaction.updateMany({ category: category._id, user: req.user._id }, { $set: { category: target._id } });
    const sourceBudgets = await Budget.find({ category: category._id, user: req.user._id });
    for (const sourceBudget of sourceBudgets) {
      const targetBudget = await Budget.findOne({
        category: target._id,
        user: req.user._id,
        month: sourceBudget.month
      });
      if (targetBudget) {
        targetBudget.limitAmount += sourceBudget.limitAmount;
        await targetBudget.save();
        await sourceBudget.deleteOne();
      } else {
        sourceBudget.category = target._id;
        await sourceBudget.save();
      }
    }
  }

  if (inUse === 0) await Budget.deleteMany({ category: category._id, user: req.user._id });
  await category.deleteOne();

  res.json({ message: 'Category deleted.', movedTransactions: inUse });
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
