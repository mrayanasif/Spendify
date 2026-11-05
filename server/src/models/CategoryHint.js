const mongoose = require('mongoose');

/**
 * One row per (student, word, category). Every time a student saves a
 * transaction the words in its description gain weight towards the category
 * they chose, and lose a little weight from the category the assistant guessed
 * wrong. This is what makes suggestions improve with use.
 */
const categoryHintSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, lowercase: true, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    weight: { type: Number, default: 1 }
  },
  { timestamps: true }
);

categoryHintSchema.index({ user: 1, token: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('CategoryHint', categoryHintSchema);
