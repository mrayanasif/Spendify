require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectDatabase } = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { runDueRecurring } = require('./services/recurring');
const ai = require('./services/ai');
const { getGlobalSettings } = require('./services/systemSettings');
const { ensureDefaultCategories } = require('./services/defaultCategories');

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, cb) => {
      const allowed = (process.env.CLIENT_URL || 'http://localhost:5173')
        .split(',')
        .map((s) => s.trim());
      // Vite switches to the next port (5174, 5175, ...) when its default is
      // occupied. Allow local dev origins so that fallback port still works.
      const isLocalDevOrigin =
        process.env.NODE_ENV !== 'production' &&
        /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
      const vercelHosts = [
        process.env.VERCEL_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL
      ].filter(Boolean);
      const isVercelOrigin = vercelHosts.some((host) => {
        const normalized = host.startsWith('http') ? host : `https://${host}`;
        try {
          return new URL(normalized).origin === origin;
        } catch {
          return false;
        }
      });
      // No origin: same-origin requests, curl, or the built front end served by this app.
      if (!origin || allowed.includes(origin) || isLocalDevOrigin || isVercelOrigin) return cb(null, true);
      return cb(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Sign-in and password endpoints get a tighter limit than the rest of the API.
app.use(
  [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/reset-password',
    '/api/auth/change-password'
  ],
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: async () => (await getGlobalSettings()).authRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
  })
);
app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  console.log('\n  Spendify API');
  await connectDatabase();
  const createdCategories = await ensureDefaultCategories();
  if (createdCategories) console.log(`  categories : ${createdCategories} shared defaults initialized`);

  // One line of AI status, without ever printing the key itself.
  const aiInfo = ai.describe();
  console.log(
    `  ai         : ${aiInfo.configured ? `${aiInfo.model} (thinking ${aiInfo.thinking})` : 'off - summaries written locally'}`
  );

  // Mail is optional too; say which path is active so "dev mode" is never a surprise.
  const mailReady = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
  console.log(
    `  mail       : ${mailReady ? `smtp ${process.env.SMTP_USER}` : 'console only - SMTP_PASS missing, reset links are shown in the app'}`
  );

  // Catch up on recurring entries that fell due while the server was off.
  try {
    const created = await runDueRecurring();
    if (created.length) console.log(`  recurring  : generated ${created.length} pending entr${created.length === 1 ? 'y' : 'ies'}`);
  } catch (err) {
    console.warn('  recurring  : skipped —', err.message);
  }

  app.listen(PORT, () => {
    console.log(`  api        : http://localhost:${PORT}/api`);
    console.log(`  client     : ${process.env.CLIENT_URL || 'http://localhost:5173'}\n`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = app;
