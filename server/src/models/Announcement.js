const mongoose = require('mongoose');

/**
 * Admin-authored content. `announcement` rows show as a banner on the student
 * dashboard; `tipTemplate` rows are generic advice mixed into the tips feed when
 * a student has too little history for data-driven tips.
 */
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    kind: { type: String, enum: ['announcement', 'tipTemplate'], default: 'announcement', index: true },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);
