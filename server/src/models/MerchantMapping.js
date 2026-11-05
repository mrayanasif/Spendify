const mongoose = require('mongoose');

/**
 * Stores student-specific merchant -> category preferences.
 * When a student confirms or auto-adds a receipt from a merchant (e.g. "Imtiaz Super Market" -> "Food"),
 * future receipts from the same merchant will map directly to this category.
 */
const merchantMappingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    merchant: { type: String, required: true, lowercase: true, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }
  },
  { timestamps: true }
);

merchantMappingSchema.index({ user: 1, merchant: 1 }, { unique: true });

module.exports = mongoose.model('MerchantMapping', merchantMappingSchema);

