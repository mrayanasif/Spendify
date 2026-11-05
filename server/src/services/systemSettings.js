const SystemSetting = require('../models/SystemSetting');

const DEFAULTS = {
  aiEnabled: true,
  aiModel: 'deepseek-chat',
  aiMaxOutputTokens: 1024,
  aiTimeoutMs: 20000,
  sessionIdleMinutes: 15,
  sessionWarningSeconds: 60,
  authRateLimit: 40
};

let cached = null;
let cachedAt = 0;

async function getGlobalSettings({ refresh = false } = {}) {
  if (!refresh && cached && Date.now() - cachedAt < 30000) return { ...cached };
  try {
    const stored = await SystemSetting.findOne({ scope: 'global' }).lean();
    cached = { ...DEFAULTS, ...(stored || {}) };
    cachedAt = Date.now();
    return { ...cached };
  } catch {
    return { ...DEFAULTS };
  }
}

function clearSettingsCache() {
  cached = null;
  cachedAt = 0;
}

module.exports = { DEFAULTS, getGlobalSettings, clearSettingsCache };