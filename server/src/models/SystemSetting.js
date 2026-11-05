const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    scope: { type: String, unique: true, default: 'global' },
    aiEnabled: { type: Boolean, default: true },
    aiModel: { type: String, trim: true, maxlength: 100, default: 'deepseek-chat' },
    aiMaxOutputTokens: { type: Number, min: 128, max: 8192, default: 1024 },
    aiTimeoutMs: { type: Number, min: 2000, max: 60000, default: 20000 },
    sessionIdleMinutes: { type: Number, min: 5, max: 120, default: 15 },
    sessionWarningSeconds: { type: Number, min: 15, max: 300, default: 60 },
    authRateLimit: { type: Number, min: 5, max: 200, default: 40 },
    defaultCategoriesInitialized: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemSetting', systemSettingSchema);