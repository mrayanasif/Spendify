const mongoose = require('mongoose');
const app = require('./server');
const { connectDatabase } = require('./config/db');
const { ensureDefaultCategories } = require('./services/defaultCategories');

let startupPromise;

async function prepareDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!startupPromise) {
    startupPromise = connectDatabase()
      .then(() => ensureDefaultCategories())
      .catch((error) => {
        startupPromise = null;
        throw error;
      });
  }
  await startupPromise;
}

module.exports = async function vercelHandler(req, res) {
  try {
    await prepareDatabase();
  } catch (error) {
    console.error('Vercel API could not connect to MongoDB:', error.message);
    return res.status(503).json({ error: 'Database is temporarily unavailable.' });
  }

  return app(req, res);
};
