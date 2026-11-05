const crypto = require('crypto');
const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const Budget = require('../models/Budget');
const Insight = require('../models/Insight');
const ApiError = require('../utils/ApiError');
const { monthKey, monthStart, monthEnd, lastMonths, shortMonthLabel } = require('../utils/dates');

/* --------------------------------------------------------------- overview */

/** GET /api/admin/stats — system-wide usage figures for the control panel. */
async function stats(req, res) {
  const month = monthKey();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const months = lastMonths(6);

  const [
    totalUsers, activeUsers, disabledUsers, newUsers,
    totalTransactions, monthTransactions, categoryCount, defaultCount,
    topCategories, signupTrend, volumeTrend, valueAgg, recentUsers
  ] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'student', lastLoginAt: { $gte: thirtyDaysAgo } }),
    User.countDocuments({ role: 'student', isDisabled: true }),
    User.countDocuments({ role: 'student', createdAt: { $gte: thirtyDaysAgo } }),
    Transaction.countDocuments({ deletedAt: null }),
    Transaction.countDocuments({ deletedAt: null, date: { $gte: monthStart(month), $lt: monthEnd(month) } }),
    Category.countDocuments({}),
    Category.countDocuments({ isDefault: true }),

    Transaction.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$category', count: { $sum: 1 }, total: { $sum: '$amount' } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      { $sort: { count: -1 } },
      { $limit: 8 },
      {
        $project: {
          _id: 0,
          name: '$category.name',
          color: '$category.color',
          type: '$category.type',
          count: 1,
          total: { $round: ['$total', 2] }
        }
      }
    ]),

    User.aggregate([
      { $match: { role: 'student', createdAt: { $gte: monthStart(months[0]) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } }
    ]),

    Transaction.aggregate([
      { $match: { deletedAt: null, date: { $gte: monthStart(months[0]) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, count: { $sum: 1 } } }
    ]),

    Transaction.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } }
    ]),

    User.find({ role: 'student' }).sort({ createdAt: -1 }).limit(5).lean()
  ]);

  const signupBy = new Map(signupTrend.map((r) => [r._id, r.count]));
  const volumeBy = new Map(volumeTrend.map((r) => [r._id, r.count]));

  res.json({
    users: {
      total: totalUsers,
      active30d: activeUsers,
      disabled: disabledUsers,
      new30d: newUsers
    },
    transactions: {
      total: totalTransactions,
      thisMonth: monthTransactions,
      averagePerUser: totalUsers ? Math.round((totalTransactions / totalUsers) * 10) / 10 : 0,
      incomeLogged: Math.round((valueAgg.find((v) => v._id === 'income')?.total || 0) * 100) / 100,
      expenseLogged: Math.round((valueAgg.find((v) => v._id === 'expense')?.total || 0) * 100) / 100
    },
    categories: { total: categoryCount, defaults: defaultCount, personal: categoryCount - defaultCount },
    topCategories,
    trend: months.map((m) => ({
      month: m,
      label: shortMonthLabel(m),
      signups: signupBy.get(m) || 0,
      transactions: volumeBy.get(m) || 0
    })),
    recentUsers: recentUsers.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      isDisabled: u.isDisabled
    }))
  });
}

/* ------------------------------------------------------------------ users */

/** GET /api/admin/users?q=&status=&page= */
async function listUsers(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 15);

  const filter = { role: 'student' };
  if (req.query.q?.trim()) {
    const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  if (req.query.status === 'disabled') filter.isDisabled = true;
  if (req.query.status === 'active') filter.isDisabled = false;

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter)
  ]);

  // Attach each student's transaction count so the list is useful at a glance.
  const counts = await Transaction.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) }, deletedAt: null } },
    { $group: { _id: '$user', count: { $sum: 1 } } }
  ]);
  const countBy = new Map(counts.map((c) => [c._id.toString(), c.count]));

  res.json({
    users: users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      academicYear: u.academicYear,
      isDisabled: u.isDisabled,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      transactionCount: countBy.get(u._id.toString()) || 0
    })),
    page,
    total,
    pages: Math.max(1, Math.ceil(total / limit))
  });
}

/** GET /api/admin/users/:id — profile plus a short activity picture. */
async function getUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== 'student') throw ApiError.notFound('Student not found.');

  const [transactionCount, budgetCount, insightCount, latest] = await Promise.all([
    Transaction.countDocuments({ user: user._id, deletedAt: null }),
    Budget.countDocuments({ user: user._id }),
    Insight.countDocuments({ user: user._id }),
    Transaction.find({ user: user._id, deletedAt: null })
      .populate('category', 'name color')
      .sort({ date: -1 })
      .limit(5)
      .lean()
  ]);

  res.json({
    user: user.toPublic(),
    activity: { transactionCount, budgetCount, insightCount, latest }
  });
}

/** PATCH /api/admin/users/:id — `{ action: 'disable' | 'enable' | 'reset-password' }` */
async function updateUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== 'student') throw ApiError.notFound('Student not found.');

  switch (req.body.action) {
    case 'disable':
      user.isDisabled = true;
      await user.save();
      return res.json({ message: `${user.name}'s account has been disabled.`, user: user.toPublic() });

    case 'enable':
      user.isDisabled = false;
      await user.save();
      return res.json({ message: `${user.name}'s account has been re-enabled.`, user: user.toPublic() });

    case 'reset-password': {
      // Issues a temporary password the admin reads out; the student changes it after signing in.
      const temporary = `Cc-${crypto.randomBytes(4).toString('hex')}`;
      await user.setPassword(temporary);
      user.resetTokenHash = undefined;
      user.resetTokenExpiresAt = undefined;
      await user.save();
      return res.json({
        message: `Temporary password set for ${user.name}. Ask them to change it after signing in.`,
        temporaryPassword: temporary
      });
    }

    default:
      throw ApiError.badRequest('Unknown action. Use disable, enable or reset-password.');
  }
}

/** DELETE /api/admin/users/:id */
async function deleteUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== 'student') throw ApiError.notFound('Student not found.');

  await Promise.all([
    Transaction.deleteMany({ user: user._id }),
    Budget.deleteMany({ user: user._id }),
    Insight.deleteMany({ user: user._id }),
    Category.deleteMany({ owner: user._id })
  ]);
  await user.deleteOne();

  res.json({ message: `${user.name}'s account and data have been removed.` });
}

/* ------------------------------------------------------ default categories */

/** GET /api/admin/categories */
async function listDefaultCategories(_req, res) {
  const categories = await Category.find({ isDefault: true, owner: null }).sort({ type: 1, name: 1 }).lean();

  const [usage, budgetUsage] = await Promise.all([
    Transaction.aggregate([
      { $match: { category: { $in: categories.map((c) => c._id) } } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]),
    Budget.aggregate([
      { $match: { category: { $in: categories.map((c) => c._id) } } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ])
  ]);
  const usageBy = new Map(usage.map((u) => [u._id.toString(), u.count]));
  const budgetUsageBy = new Map(budgetUsage.map((u) => [u._id.toString(), u.count]));

  res.json({
    categories: categories.map((c) => ({
      ...c,
      usageCount: usageBy.get(c._id.toString()) || 0,
      budgetCount: budgetUsageBy.get(c._id.toString()) || 0
    }))
  });
}

/** POST /api/admin/categories */
async function createDefaultCategory(req, res) {
  const { name, type, icon, color } = req.body;
  if (typeof name !== 'string' || !name.trim()) throw ApiError.badRequest('Give the category a name.');
  if (!['income', 'expense'].includes(type)) throw ApiError.badRequest('Choose income or expense.');

  const cleanName = name.trim();
  const exists = await Category.findOne({
    type,
    name: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  });
  if (exists) throw ApiError.conflict(`A ${type} category called "${cleanName}" already exists.`);

  const category = await Category.create({
    name: cleanName,
    type,
    icon: icon || 'dots',
    color: color || '#8a94a6',
    isDefault: true,
    owner: null
  });

  res.status(201).json({ category });
}

/** PUT /api/admin/categories/:id */
async function updateDefaultCategory(req, res) {
  const category = await Category.findOne({ _id: req.params.id, isDefault: true, owner: null });
  if (!category) throw ApiError.notFound('Default category not found.');

  const { name, icon, color, isArchived } = req.body;
  if (name !== undefined) {
    const cleanName = String(name).trim();
    if (!cleanName) throw ApiError.badRequest('Give the category a name.');
    const clash = await Category.findOne({
      _id: { $ne: category._id },
      type: category.type,
      name: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    });
    if (clash) throw ApiError.conflict(`A ${category.type} category called "${cleanName}" already exists.`);
    category.name = cleanName;
  }
  if (icon !== undefined) category.icon = icon;
  if (color !== undefined) category.color = color;
  if (isArchived !== undefined) {
    if (!isArchived) {
      const clash = await Category.findOne({
        _id: { $ne: category._id },
        type: category.type,
        name: new RegExp(`^${category.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      });
      if (clash) throw ApiError.conflict(`A ${category.type} category called "${category.name}" already exists.`);
    }
    category.isArchived = Boolean(isArchived);
  }

  await category.save();
  res.json({ category });
}

/**
 * DELETE /api/admin/categories/:id
 * Archives instead of deleting when transactions reference the category, so no
 * student's history is orphaned.
 */
async function deleteDefaultCategory(req, res) {
  const category = await Category.findOne({ _id: req.params.id, isDefault: true, owner: null });
  if (!category) throw ApiError.notFound('Default category not found.');

  const [inUse, budgetCount] = await Promise.all([
    Transaction.countDocuments({ category: category._id }),
    Budget.countDocuments({ category: category._id })
  ]);
  if (inUse > 0 || budgetCount > 0) {
    category.isArchived = true;
    await category.save();
    return res.json({
      message: `This category is still referenced by ${inUse} transaction${inUse === 1 ? '' : 's'} and ${budgetCount} budget${budgetCount === 1 ? '' : 's'}, so it was archived instead of deleted. It no longer appears in new entry forms.`,
      archived: true
    });
  }

  await category.deleteOne();
  res.json({ message: 'Default category deleted.', archived: false });
}

/* ------------------------------------- announcements and tip templates */

/**
 * Announcing something has to reach a student wherever they are, not only on
 * the dashboard banner. Publishing an announcement also drops one row into
 * every active student's notification bell.
 */
async function notifyStudents(item) {
  if (item.kind !== 'announcement' || !item.active) return 0;

  const students = await User.find({ role: 'student', isDisabled: false }).select('_id').lean();
  if (!students.length) return 0;

  await Notification.insertMany(
    students.map((student) => ({
      user: student._id,
      title: item.title,
      body: String(item.body || '').slice(0, 300),
      level: 'info',
      link: '/app'
    })),
    { ordered: false }
  );

  return students.length;
}

/** GET /api/admin/announcements?kind= */
async function listAnnouncements(req, res) {
  const filter = {};
  if (req.query.kind) filter.kind = req.query.kind;

  const items = await Announcement.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ items });
}

/** POST /api/admin/announcements */
async function createAnnouncement(req, res) {
  const { title, body, kind = 'announcement', active = true } = req.body;
  if (!title?.trim() || !body?.trim()) throw ApiError.badRequest('Both a title and a message are required.');

  const item = await Announcement.create({
    title: title.trim(),
    body: body.trim(),
    kind: kind === 'tipTemplate' ? 'tipTemplate' : 'announcement',
    active: Boolean(active),
    createdBy: req.user._id
  });

  const notified = await notifyStudents(item);

  res.status(201).json({ item, notified });
}

/** PUT /api/admin/announcements/:id */
async function updateAnnouncement(req, res) {
  const item = await Announcement.findById(req.params.id);
  if (!item) throw ApiError.notFound('Announcement not found.');

  const wasLive = item.kind === 'announcement' && item.active;

  const { title, body, active, kind } = req.body;
  if (title !== undefined) item.title = String(title).trim();
  if (body !== undefined) item.body = String(body).trim();
  if (active !== undefined) item.active = Boolean(active);
  if (kind) item.kind = kind === 'tipTemplate' ? 'tipTemplate' : 'announcement';

  await item.save();

  // Re-publishing a draft should announce it; editing a live one should not
  // ring every bell again.
  const isLive = item.kind === 'announcement' && item.active;
  const notified = isLive && !wasLive ? await notifyStudents(item) : 0;

  res.json({ item, notified });
}

/** DELETE /api/admin/announcements/:id */
async function deleteAnnouncement(req, res) {
  const item = await Announcement.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Announcement not found.');
  res.json({ message: 'Removed.' });
}

module.exports = {
  stats,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  listDefaultCategories,
  createDefaultCategory,
  updateDefaultCategory,
  deleteDefaultCategory,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement
};
