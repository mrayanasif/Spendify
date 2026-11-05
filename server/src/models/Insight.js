const mongoose = require('mongoose');

const highlightSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    direction: { type: String, enum: ['up', 'down', 'flat'], default: 'flat' },
    tone: { type: String, enum: ['good', 'warn', 'bad', 'neutral'], default: 'neutral' }
  },
  { _id: false }
);

const insightSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** `YYYY-MM` of the month the summary covers. */
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    summaryText: { type: String, required: true },
    summaryVersion: { type: Number, default: 1 },
    tipText: { type: String, default: '' },
    highlights: { type: [highlightSchema], default: [] },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },
    bookmarked: { type: Boolean, default: false },
    generatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

insightSchema.index({ user: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Insight', insightSchema);
