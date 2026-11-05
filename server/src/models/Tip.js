const mongoose = require('mongoose');

/**
 * A saving tip produced by services/tips.js. Tips are regenerated on demand;
 * the row survives so a student's "pinned" and "dismissed" choices stick, and so
 * the same advice is not re-offered after it was waved away.
 */
const tipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Stable identity for a piece of advice, e.g. `overspend:<categoryId>`. */
    key: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    /** Money the student could realistically keep if they act on this. Drives ranking. */
    potentialSaving: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'pinned', 'dismissed'], default: 'active' },
    bookmarked: { type: Boolean, default: false },
    month: { type: String, match: /^\d{4}-\d{2}$/ },
    lastSeenAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

tipSchema.index({ user: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Tip', tipSchema);
