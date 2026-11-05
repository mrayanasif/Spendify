const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    /** Stored as `YYYY-MM` so a month is easy to query and compare. */
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    limitAmount: { type: Number, required: true, min: 0 },
    /** Remembers which alert levels already fired so we do not spam the bell. */
    alertsSent: { type: [Number], default: [] }
  },
  { timestamps: true }
);

budgetSchema.index({ user: 1, category: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
