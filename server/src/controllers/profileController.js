const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Transaction = require('../models/Transaction');
const Note = require('../models/Note');

/** PUT /api/profile */
async function updateProfile(req, res) {
  const { name, academicYear, monthlyAllowance, savingsGoal, currentSavings } = req.body;
  const user = req.user;

  if (name !== undefined) user.name = String(name).trim();
  if (academicYear !== undefined) user.academicYear = String(academicYear).trim();
  if (monthlyAllowance !== undefined) user.monthlyAllowance = Math.max(0, Number(monthlyAllowance) || 0);
  if (savingsGoal !== undefined) user.savingsGoal = Math.max(0, Number(savingsGoal) || 0);
  if (currentSavings !== undefined) user.currentSavings = Math.max(0, Number(currentSavings) || 0);

  await user.save();
  res.json({ user: user.toPublic() });
}

/** PUT /api/profile/preferences — theme, font scale, currency, assistant toggle. */
async function updatePreferences(req, res) {
  const { theme, fontScale, currency, assistantEnabled } = req.body;
  const user = req.user;

  if (theme === 'light' || theme === 'dark') user.preferences.theme = theme;
  if (fontScale !== undefined) {
    user.preferences.fontScale = Math.min(1.3, Math.max(0.9, Number(fontScale) || 1));
  }
  if (currency) user.preferences.currency = String(currency).slice(0, 6).toUpperCase();
  if (assistantEnabled !== undefined) user.preferences.assistantEnabled = Boolean(assistantEnabled);

  await user.save();
  res.json({ user: user.toPublic() });
}

/**
 * GET /api/profile/activity
 * Backs "recently viewed and recently edited transactions across sessions".
 * Deduplicated by transaction so one row does not fill the whole list.
 */
async function recentActivity(req, res) {
  const logs = await ActivityLog.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(120)
    .populate({
      path: 'transaction',
      populate: { path: 'category', select: 'name color icon' }
    })
    .lean();

  const seen = new Set();
  const viewed = [];
  const edited = [];

  for (const log of logs) {
    if (!log.transaction) continue;
    const id = log.transaction._id.toString();
    const entry = {
      logId: log._id,
      action: log.action,
      at: log.createdAt,
      changes: log.changes,
      transaction: log.transaction
    };

    if (log.action === 'viewed') {
      if (seen.has(`v:${id}`)) continue;
      seen.add(`v:${id}`);
      if (viewed.length < 8) viewed.push(entry);
    } else if (['updated', 'created', 'deleted', 'restored'].includes(log.action)) {
      if (seen.has(`e:${id}`)) continue;
      seen.add(`e:${id}`);
      if (edited.length < 8) edited.push(entry);
    }
  }

  res.json({ viewed, edited });
}

/** DELETE /api/profile — removes the account and everything attached to it. */
async function deleteAccount(req, res) {
  const userId = req.user._id;
  await Promise.all([
    Transaction.deleteMany({ user: userId }),
    ActivityLog.deleteMany({ user: userId }),
    Note.deleteMany({ user: userId })
  ]);
  await User.findByIdAndDelete(userId);
  res.json({ message: 'Your account and all of its data have been removed.' });
}

module.exports = { updateProfile, updatePreferences, recentActivity, deleteAccount };
