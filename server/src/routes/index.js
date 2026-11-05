const express = require('express');
const multer = require('multer');

const { requireAuth, requireAdmin, requireStudent } = require('../middleware/auth');

const auth = require('../controllers/authController');
const profile = require('../controllers/profileController');
const categories = require('../controllers/categoryController');
const transactions = require('../controllers/transactionController');
const recurringPayments = require('../controllers/recurringPaymentController');
const budgets = require('../controllers/budgetController');
const reports = require('../controllers/reportController');
const insights = require('../controllers/insightController');
const tips = require('../controllers/tipController');
const notifications = require('../controllers/notificationController');
const importer = require('../controllers/importController');
const admin = require('../controllers/adminController');
const receipts = require('../controllers/receiptController');
const notes = require('../controllers/noteController');
const settings = require('../controllers/settingsController');
const rateLimit = require('express-rate-limit');

const router = express.Router();

/** Wraps an async handler so a rejected promise reaches the error middleware. */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /csv|text\/plain|excel|spreadsheet/i.test(file.mimetype) || /\.csv$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .csv files can be imported.'), ok);
  }
});

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB limit per requirements
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Only image files (JPEG, PNG, WebP) are accepted.'), ok);
  }
});

const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many receipt scans. Please wait a few minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

/* ------------------------------------------------------------ 1. public */

router.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

router.post('/auth/register', h(auth.register));
router.post('/auth/login', h(auth.login));

// Per-IP rate limiter for password reset endpoints (5 req / 15 min per IP)
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const ip = req.ip || 'unknown';
    const email = (req.body && req.body.email) ? req.body.email.toLowerCase().trim() : '';
    return `fp:${ip}:${email}`;
  },
  message: { error: 'Too many reset attempts. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

router.post('/auth/forgot-password', forgotPasswordLimiter, h(auth.forgotPassword));
router.post('/auth/reset-password', h(auth.resetPassword));

/* -------------------------------------------- 2. everything below needs a session */

router.use(requireAuth);

/* --------------------------------------- 3. shared by students and admins */

router.get('/auth/me', h(auth.me));
router.get('/auth/session', h(auth.session));
router.post('/auth/heartbeat', h(auth.heartbeat));
router.post('/auth/logout', h(auth.logout));
router.post('/auth/change-password', h(auth.changePassword));
router.put('/profile', h(profile.updateProfile));
router.put('/profile/preferences', h(profile.updatePreferences));

/* ------------------------------------------------------------- 4. admin */
/* Mounted before the student area so admin traffic never meets requireStudent. */

const adminRouter = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get('/stats', h(admin.stats));
adminRouter.get('/settings', h(settings.getSettings));
adminRouter.put('/settings', h(settings.updateSettings));

adminRouter.get('/users', h(admin.listUsers));
adminRouter.get('/users/:id', h(admin.getUser));
adminRouter.patch('/users/:id', h(admin.updateUser));
adminRouter.delete('/users/:id', h(admin.deleteUser));

adminRouter.get('/categories', h(admin.listDefaultCategories));
adminRouter.post('/categories', h(admin.createDefaultCategory));
adminRouter.put('/categories/:id', h(admin.updateDefaultCategory));
adminRouter.delete('/categories/:id', h(admin.deleteDefaultCategory));

adminRouter.get('/announcements', h(admin.listAnnouncements));
adminRouter.post('/announcements', h(admin.createAnnouncement));
adminRouter.put('/announcements/:id', h(admin.updateAnnouncement));
adminRouter.delete('/announcements/:id', h(admin.deleteAnnouncement));

router.use('/admin', adminRouter);

/* ----------------------------------------------------------- 5. student */
/* The guard is scoped to these prefixes so an unknown URL still 404s. */

router.use(
  [
    '/profile', '/categories', '/transactions', '/budgets', '/dashboard',
    '/reports', '/insights', '/tips', '/bookmarks', '/notifications', '/import', '/notes',
    '/receipts'
  ],
  requireStudent
);

/* --- Receipt Scanner routes --- */
router.post('/receipts/scan', scanLimiter, receiptUpload.single('image'), h(receipts.scanReceipt));
router.post('/receipts/confirm', h(receipts.confirmReceipt));
router.post('/receipts/undo', h(receipts.undoReceipt));
router.post('/receipts/check-duplicate', h(receipts.checkReceiptDuplicate));

router.get('/profile/activity', h(profile.recentActivity));
router.delete('/profile', h(profile.deleteAccount));

router.get('/categories', h(categories.listCategories));
router.post('/categories', h(categories.createCategory));
router.put('/categories/:id', h(categories.updateCategory));
router.delete('/categories/:id', h(categories.deleteCategory));

// Fixed segments come before `/:id` so they are not read as an id.
router.get('/transactions', h(transactions.listTransactions));
router.get('/transactions/deleted', h(transactions.listDeleted));
router.get('/transactions/recurring', h(transactions.listRecurring));
router.get('/recurring-payments', h(recurringPayments.listRecurringPayments));
router.post('/recurring-payments', h(recurringPayments.createRecurringPayment));
router.put('/recurring-payments/:id', h(recurringPayments.updateRecurringPayment));
router.patch('/recurring-payments/:id/status', h(recurringPayments.setRecurringPaymentStatus));
router.delete('/recurring-payments/:id', h(recurringPayments.deleteRecurringPayment));
router.post('/transactions/suggest', h(transactions.suggest));
router.post('/transactions', h(transactions.createTransaction));
router.get('/transactions/:id', h(transactions.getTransaction));
router.get('/transactions/:id/history', h(transactions.transactionHistory));
router.put('/transactions/:id', h(transactions.updateTransaction));
router.post('/transactions/:id/restore', h(transactions.restoreTransaction));
router.delete('/transactions/:id', h(transactions.deleteTransaction));

router.get('/budgets', h(budgets.listBudgets));
router.post('/budgets', h(budgets.upsertBudget));
router.post('/budgets/copy', h(budgets.copyFromPreviousMonth));
router.delete('/budgets/:id', h(budgets.deleteBudget));

router.get('/dashboard', h(reports.dashboard));
router.get('/reports', h(reports.reports));
router.get('/reports/forecast', h(reports.forecast));
router.get('/reports/anomalies', h(reports.anomalies));
router.post('/reports/share', h(reports.shareReport));

router.get('/insights', h(insights.listInsights));
router.post('/insights/generate', h(insights.generate));
router.get('/insights/:month', h(insights.getInsight));
router.patch('/insights/:id/bookmark', h(insights.toggleBookmark));

router.get('/tips', h(tips.listTips));
router.patch('/tips/:id', h(tips.updateTip));
router.get('/bookmarks', h(tips.listBookmarks));

router.get('/notes', h(notes.listNotes));
router.post('/notes', h(notes.createNote));
router.put('/notes/:id', h(notes.updateNote));
router.delete('/notes/:id', h(notes.deleteNote));

router.get('/notifications', h(notifications.listNotifications));
router.post('/notifications/read-all', h(notifications.markAllRead));
router.patch('/notifications/:id/read', h(notifications.markRead));
router.delete('/notifications/:id', h(notifications.remove));

router.get('/import/template', importer.template);
router.post('/import/preview', upload.single('file'), h(importer.preview));
router.post('/import/commit', h(importer.commit));

module.exports = router;
