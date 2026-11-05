const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const preferencesSchema = new mongoose.Schema(
  {
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    fontScale: { type: Number, min: 0.9, max: 1.3, default: 1 },
    currency: { type: String, default: 'USD' },
    assistantEnabled: { type: Boolean, default: true }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email address']
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['student', 'admin'], default: 'student', index: true },

    // profile fields from the SRS
    academicYear: { type: String, default: '', maxlength: 40 },
    monthlyAllowance: { type: Number, default: 0, min: 0 },
    savingsGoal: { type: Number, default: 0, min: 0 },
    currentSavings: { type: Number, default: 0, min: 0 },

    preferences: { type: preferencesSchema, default: () => ({}) },

    isDisabled: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    lastActive: { type: Date },
    tokenVersion: { type: Number, default: 0, min: 0 },

    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
    passwordChangedAt: { type: Date, select: false }
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
  this.passwordChangedAt = new Date();
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    academicYear: this.academicYear,
    monthlyAllowance: this.monthlyAllowance,
    savingsGoal: this.savingsGoal,
    currentSavings: this.currentSavings,
    preferences: this.preferences,
    isDisabled: this.isDisabled,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
    lastActive: this.lastActive
  };
};

module.exports = mongoose.model('User', userSchema);
