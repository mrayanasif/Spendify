const mongoose = require('mongoose');

/**
 * Two kinds of category live in this collection:
 *   - system defaults (`isDefault: true`, `owner: null`) managed by admins
 *   - personal categories owned by one student
 * Both are selectable when logging a transaction.
 */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    type: { type: String, enum: ['income', 'expense'], required: true, index: true },
    icon: { type: String, default: 'dots' },
    color: { type: String, default: '#8a94a6' },
    isDefault: { type: Boolean, default: false },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isArchived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// A student cannot have two categories with the same name and type.
categorySchema.index({ owner: 1, type: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);
