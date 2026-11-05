const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const { checkBudgetAlerts } = require('../services/budgetAlerts');
const { monthKey } = require('../utils/dates');

/** GET /api/notifications */
async function listNotifications(req, res) {
  // Re-run the budget check so the bell reflects the latest spending.
  await checkBudgetAlerts(req.user, monthKey());

  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(40).lean(),
    Notification.countDocuments({ user: req.user._id, read: false })
  ]);

  res.json({ items, unread });
}

/** PATCH /api/notifications/:id/read */
async function markRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { read: true } },
    { new: true }
  );
  if (!notification) throw ApiError.notFound('Notification not found.');
  res.json({ notification });
}

/** POST /api/notifications/read-all */
async function markAllRead(req, res) {
  const result = await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
  res.json({ updated: result.modifiedCount });
}

/** DELETE /api/notifications/:id */
async function remove(req, res) {
  await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  res.json({ message: 'Notification removed.' });
}

module.exports = { listNotifications, markRead, markAllRead, remove };
