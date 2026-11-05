const assert = require('assert');
const Budget = require('../src/models/Budget');
const { requireExpenseBudget } = require('../src/services/expenseBudget');

async function run() {
  const originalExists = Budget.exists;
  const query = { user: 'student-id', category: 'food-id', month: '2026-10' };

  try {
    let receivedQuery;
    Budget.exists = async (filter) => {
      receivedQuery = filter;
      return { _id: 'budget-id' };
    };
    await requireExpenseBudget(query.user, query.category, query.month, 'Food');
    assert.deepStrictEqual(receivedQuery, query, 'budget lookup should be scoped to student, category, and month');

    Budget.exists = async () => null;
    await assert.rejects(
      requireExpenseBudget(query.user, query.category, query.month, 'Food'),
      (error) => error.status === 400 && error.message === 'Please create a budget for "Food" first, then add this expense.'
    );
  } finally {
    Budget.exists = originalExists;
  }
}

run()
  .then(() => console.log('Expense budget checks passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
