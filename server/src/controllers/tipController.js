const Tip = require('../models/Tip');
const Insight = require('../models/Insight');
const ApiError = require('../utils/ApiError');
const tipsService = require('../services/tips');
const { monthKey, monthLabel } = require('../utils/dates');

/** GET /api/tips — regenerates against the latest data, then returns them ranked. */
async function listTips(req, res) {
  const month = req.query.month || monthKey();
  const includeDismissed = req.query.includeDismissed === 'true';

  await tipsService.generateTips(req.user, month);
  const tips = await tipsService.listTips(req.user._id, { includeDismissed });

  res.json({ tips, month });
}

/**
 * PATCH /api/tips/:id — `{ action: 'pin' | 'unpin' | 'dismiss' | 'restore' | 'bookmark' }`
 */
async function updateTip(req, res) {
  const tip = await Tip.findOne({ _id: req.params.id, user: req.user._id });
  if (!tip) throw ApiError.notFound('Tip not found.');

  switch (req.body.action) {
    case 'pin':
      tip.status = 'pinned';
      break;
    case 'unpin':
    case 'restore':
      tip.status = 'active';
      break;
    case 'dismiss':
      tip.status = 'dismissed';
      break;
    case 'bookmark':
      tip.bookmarked = !tip.bookmarked;
      break;
    default:
      throw ApiError.badRequest('Unknown action. Use pin, unpin, dismiss, restore or bookmark.');
  }

  await tip.save();
  res.json({ tip });
}

/** GET /api/bookmarks — pinned/bookmarked tips together with bookmarked insights. */
async function listBookmarks(req, res) {
  const [tips, insights] = await Promise.all([
    Tip.find({ user: req.user._id, $or: [{ bookmarked: true }, { status: 'pinned' }] })
      .populate('category', 'name color icon')
      .sort({ updatedAt: -1 })
      .lean(),
    Insight.find({ user: req.user._id, bookmarked: true }).sort({ month: -1 }).lean()
  ]);

  res.json({
    tips,
    insights: insights.map((i) => ({ ...i, monthLabel: monthLabel(i.month) })),
    total: tips.length + insights.length
  });
}

module.exports = { listTips, updateTip, listBookmarks };
