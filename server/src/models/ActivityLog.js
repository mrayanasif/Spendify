const mongoose = require('mongoose');

/**
 * Append-only trail behind two SRS requirements:
 *   - "edits and deletes transactions while retaining the full history"
 *   - "tracks recently viewed and recently edited transactions across sessions"
 * `snapshot` holds the values as they were just after the action.
 */
const activityLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', index: true },
    action: {
      type: String,
      enum: ['created', 'viewed', 'updated', 'deleted', 'restored', 'imported'],
      required: true
    },
    changes: { type: [String], default: [] },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
