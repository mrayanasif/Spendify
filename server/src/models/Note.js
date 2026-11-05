const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    body: { type: String, trim: true, required: true, maxlength: 4000 },
    tag: { type: String, trim: true, maxlength: 32, default: '' },
    color: { type: String, enum: ['rose', 'honey', 'mint', 'sky'], default: 'rose' },
    pinned: { type: Boolean, default: false }
  },
  { timestamps: true }
);

noteSchema.index({ user: 1, pinned: -1, updatedAt: -1 });

module.exports = mongoose.model('Note', noteSchema);
