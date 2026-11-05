const Budget = require('../models/Budget');
const ApiError = require('../utils/ApiError');

async function requireExpenseBudget(userId, categoryId, month, categoryName) {
  const budget = await Budget.exists({ user: userId, category: categoryId, month });
  if (!budget) {
    throw ApiError.badRequest(`Please create a budget for "${categoryName}" first, then add this expense.`);
  }
}

module.exports = { requireExpenseBudget };
