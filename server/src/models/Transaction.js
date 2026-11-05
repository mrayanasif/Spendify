const mongoose = require('mongoose');

const recurrenceSchema = new mongoose.Schema(
  {
    frequency: { type: String, enum: ['weekly', 'monthly', 'yearly'], default: 'monthly' },
    nextRunOn: { type: Date },
    endsOn: { type: Date, default: null },
    active: { type: Boolean, default: true }
  },
  { _id: false }
);

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    type: { type: String, enum: ['income', 'expense'], required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: { type: String, enum: ['cash', 'card', 'digital_wallet'], default: 'cash' },
    deductedFromSavings: { type: Boolean, default: false },
    savingsDeductedAmount: { type: Number, default: 0, min: 0 },
    savingsAddedAmount: { type: Number, default: 0, min: 0 },
    receiptDuplicateDetected: { type: Boolean, default: false },
    description: { type: String, trim: true, maxlength: 160, default: '' },
    note: { type: String, trim: true, maxlength: 400, default: '' },
    date: { type: Date, required: true, index: true },

    // How the row got here: typed in, imported from CSV, spawned by a rule, or scanned from a receipt.
    source: { type: String, enum: ['manual', 'csv', 'recurring', 'receipt_scan'], default: 'manual' },

    // Receipt scan metadata
    receiptData: {
      merchant: { type: String, default: '' },
      currency: { type: String, default: '' },
      lineItems: [
        {
          name: { type: String, default: '' },
          qty: { type: Number, default: 1 },
          price: { type: Number, default: 0 }
        }
      ],
      confidence: {
        amount: { type: Number, default: 0 },
        date: { type: Number, default: 0 },
        category: { type: Number, default: 0 }
      }
    },
    receiptImage: { type: String, default: null },

    // Recurring rules are stored as a normal transaction carrying `recurrence`.
    isRecurring: { type: Boolean, default: false },
    recurrence: { type: recurrenceSchema, default: null },
    generatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    recurringPayment: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringPayment', default: null },

    // Categorisation assistant bookkeeping
    suggestedCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    suggestionAccepted: { type: Boolean, default: null },

    // Filled in by the anomaly check in services/analytics
    flags: {
      unusuallyLarge: { type: Boolean, default: false },
      possibleDuplicate: { type: Boolean, default: false }
    },

    // Soft delete keeps the full history available for audit and reports.
    deletedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, category: 1, date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
