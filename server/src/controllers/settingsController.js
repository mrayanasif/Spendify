const SystemSetting = require('../models/SystemSetting');
const ApiError = require('../utils/ApiError');
const { DEFAULTS, clearSettingsCache } = require('../services/systemSettings');

const LIMITS = {
  aiMaxOutputTokens: [128, 8192],
  aiTimeoutMs: [2000, 60000],
  sessionIdleMinutes: [5, 120],
  sessionWarningSeconds: [15, 300],
  authRateLimit: [5, 200]
};

async function getSettings(_req, res) {
  const stored = await SystemSetting.findOne({ scope: 'global' }).lean();
  res.json({ settings: { ...DEFAULTS, ...(stored || {}) } });
}

async function updateSettings(req, res) {
  const patch = {};
  if (req.body.aiEnabled !== undefined) {
    if (typeof req.body.aiEnabled !== 'boolean') throw ApiError.badRequest('AI enabled must be true or false.');
    patch.aiEnabled = req.body.aiEnabled;
  }
  if (req.body.aiModel !== undefined) {
    const model = String(req.body.aiModel).trim();
    if (!/^[\w./:-]{1,100}$/.test(model)) throw ApiError.badRequest('Enter a valid model identifier.');
    patch.aiModel = model;
  }
  for (const [field, [min, max]] of Object.entries(LIMITS)) {
    if (req.body[field] === undefined) continue;
    const value = Number(req.body[field]);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw ApiError.badRequest(`${field} must be between ${min} and ${max}.`);
    }
    patch[field] = value;
  }

  const settings = await SystemSetting.findOneAndUpdate(
    { scope: 'global' },
    { $set: patch, $setOnInsert: { scope: 'global' } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  clearSettingsCache();
  res.json({ settings: { ...DEFAULTS, ...settings } });
}

module.exports = { getSettings, updateSettings };