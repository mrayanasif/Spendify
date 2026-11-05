const Insight = require('../models/Insight');
const ApiError = require('../utils/ApiError');
const { generateInsight } = require('../services/insights');
const { monthKey, monthLabel } = require('../utils/dates');

/** GET /api/insights — stored history, newest first. */
async function listInsights(req, res) {
  const insights = await Insight.find({ user: req.user._id }).sort({ month: -1 }).limit(24).lean();
  res.json({
    insights: insights.map((i) => ({ ...i, monthLabel: monthLabel(i.month) }))
  });
}

/** GET /api/insights/:month — regenerates when asked with `?refresh=1`. */
async function getInsight(req, res) {
  const month = req.params.month;
  if (!/^\d{4}-\d{2}$/.test(month)) throw ApiError.badRequest('Month must look like 2026-09.');

  let insight = await Insight.findOne({ user: req.user._id, month });
  if (!insight || !insight.summaryVersion || insight.summaryVersion < 2 || req.query.refresh === '1') {
    insight = await generateInsight(req.user, month);
  }

  res.json({ insight: { ...insight.toObject?.() ?? insight, monthLabel: monthLabel(month) } });
}

/** POST /api/insights/generate */
async function generate(req, res) {
  const month = req.body.month || monthKey();
  if (!/^\d{4}-\d{2}$/.test(month)) throw ApiError.badRequest('Month must look like 2026-09.');

  const insight = await generateInsight(req.user, month);
  res.json({ insight, monthLabel: monthLabel(month) });
}

/** PATCH /api/insights/:id/bookmark */
async function toggleBookmark(req, res) {
  const insight = await Insight.findOne({ _id: req.params.id, user: req.user._id });
  if (!insight) throw ApiError.notFound('Insight not found.');

  insight.bookmarked = !insight.bookmarked;
  await insight.save();
  res.json({ insight });
}

module.exports = { listInsights, getInsight, generate, toggleBookmark };
