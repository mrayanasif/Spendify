const mongoose = require('mongoose');

const recurringPaymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 400, default: '' },
    type: { type: String, enum: ['expense', 'income'], default: 'expense', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    frequency: { type: String, enum: ['weekly', 'monthly', 'yearly'], default: 'monthly' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    nextRunOn: { type: Date, required: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

recurringPaymentSchema.index({ user: 1, active: 1, nextRunOn: 1 });

module.exports = mongoose.model('RecurringPayment', recurringPaymentSchema);
