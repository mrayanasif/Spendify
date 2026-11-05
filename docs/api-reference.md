# Spendify — API reference

Base URL `http://localhost:5000/api`. Every response is JSON. Errors come back as
`{ "error": "message a student can read", "details": [...] | null }` with a matching
HTTP status.

## Authentication

Send the token from sign-in on every protected request:

```
Authorization: Bearer <token>
```

Tokens are JWTs signed with `JWT_SECRET`, valid for `JWT_EXPIRES_IN` (7 days by default),
and carry the user id and role. A disabled account is rejected at the middleware, before
any controller runs.

Routes are grouped in `server/src/routes/index.js` as **public → any session → admin →
student**, in that order. The student guard is scoped to its path prefixes so an unknown
URL still returns 404 rather than 403.

---

## Public

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ status, time }` |
| POST | `/auth/register` | `name, email, password, academicYear?, monthlyAllowance?, savingsGoal?` | `{ token, user }` — students only |
| POST | `/auth/login` | `email, password, expect?` | `{ token, user }`. `expect: 'admin' \| 'student'` pins the route to one role, which is how the two sign-ins stay separate |
| POST | `/auth/forgot-password` | `email` | `{ message, devResetLink? }`. Always the same message so the endpoint cannot reveal which emails exist. `devResetLink` appears only when SMTP is unconfigured |
| POST | `/auth/reset-password` | `token, email, password` | `{ message }` |

## Any signed-in user

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/auth/me` | — | `{ user }` — restores the session on page load |
| POST | `/auth/change-password` | `currentPassword, newPassword` | `{ message }` |
| PUT | `/profile` | `name?, academicYear?, monthlyAllowance?, savingsGoal?` | `{ user }` |
| PUT | `/profile/preferences` | `theme?, fontScale?, currency?, assistantEnabled?` | `{ user }` |

---

## Student

### Categories

| Method | Path | Notes |
|---|---|---|
| GET | `/categories` | System defaults plus this student's own, split into `income` and `expense` |
| POST | `/categories` | `name, type, icon?, color?` — 409 if the name clashes with a default or one of their own |
| PUT | `/categories/:id` | Personal categories only |
| DELETE | `/categories/:id` | 409 while transactions use it; retry with `?reassignTo=<categoryId>` to move transaction history and merge budgets into another visible category |

### Transactions

| Method | Path | Notes |
|---|---|---|
| GET | `/transactions` | Query: `type, category, from, to, q, flagged, source, sort (date\|amount), order, page, limit`. Returns `{ items, page, pages, total, totals }`. Also generates any recurring entries that fell due |
| GET | `/transactions/deleted` | The recycle bin |
| GET | `/transactions/recurring` | The rules, not what they generated |
| POST | `/transactions/suggest` | `description, type` → `{ suggestion }` with `categoryName`, `confidence` (0–0.95) and `reason`. Returns `null` when nothing scores above the floor |
| POST | `/transactions` | `type, amount, category, description?, note?, date?, isRecurring?, recurrence?, suggestedCategory?`. Passing `suggestedCategory` is what lets the assistant learn from an override |
| GET | `/transactions/:id` | Also records a `viewed` entry in the activity log |
| GET | `/transactions/:id/history` | The full audit trail for one entry |
| PUT | `/transactions/:id` | Previous values are kept in the activity log |
| DELETE | `/transactions/:id` | Soft delete — the row stays restorable |
| POST | `/transactions/:id/restore` | |

### Budgets

| Method | Path | Notes |
|---|---|---|
| GET | `/budgets?month=YYYY-MM` | Budgets joined with live spending, plus a summary including `unbudgetedSpend` |
| POST | `/budgets` | `category, month, limitAmount` — upsert. Re-runs the alert check |
| POST | `/budgets/copy` | `month` — copies the previous month's caps |
| DELETE | `/budgets/:id` | |

### Dashboard and reports

| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard?month=` | One round trip for the whole dashboard: totals, previous month, `spentChange`, top category, breakdown, six-month trend, budgets, savings progress, top three tips, the month's insight, recent entries, announcements, unread count |
| GET | `/reports` | Query: `month, from, to, categories` (comma-separated ids). Returns category breakdowns for both types, the six-month trend, daily and weekly summaries, budget performance and range totals |
| GET | `/reports/forecast?month=` | Next month projected per category from the last three |
| GET | `/reports/anomalies` | `{ large, duplicates }` |
| POST | `/reports/share` | `to, month, message?` — emails a plain-text summary. Only totals, the breakdown and the summary are sent, never individual entries |

### Insights, tips, bookmarks

| Method | Path | Notes |
|---|---|---|
| GET | `/insights` | History, newest first |
| GET | `/insights/:month` | Generates it if missing; `?refresh=1` forces a rebuild |
| POST | `/insights/generate` | `month` |
| PATCH | `/insights/:id/bookmark` | Toggles |
| GET | `/tips` | Regenerates against current data, then returns them ranked. `?includeDismissed=true` |
| PATCH | `/tips/:id` | `{ action: 'pin' \| 'unpin' \| 'dismiss' \| 'restore' \| 'bookmark' }` |
| GET | `/bookmarks` | Pinned/saved tips plus bookmarked insights |

### Notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | Re-runs the budget check first, so the bell is current |
| POST | `/notifications/read-all` | |
| PATCH | `/notifications/:id/read` | |
| DELETE | `/notifications/:id` | |

### CSV import

| Method | Path | Notes |
|---|---|---|
| GET | `/import/template` | Downloads a sample file |
| POST | `/import/preview` | multipart `file`, or JSON `{ csv }`. Parses, normalises the columns, and proposes a category per row. **Writes nothing.** Returns `{ rows, skipped, summary }` |
| POST | `/import/commit` | `{ rows: [{ line, date, description, amount, type, categoryId }] }` — writes the confirmed rows and learns from each labelled description |

Column names are matched loosely: `details`, `narration`, `particulars`, `memo` and
`merchant` all work as the description; `debit`/`credit` work as the type. Dates accept
`dd/mm/yyyy` and `yyyy-mm-dd`; accounting-style `(120.50)` is read as negative.

### Profile

| Method | Path | Notes |
|---|---|---|
| GET | `/profile/activity` | Recently viewed and recently edited entries, deduplicated |
| DELETE | `/profile` | Deletes the account and all of its data |

---

## Administrator

All under `/admin`, all requiring `role: admin`.

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats` | Users, transactions, categories, most-used categories, six-month trend, newest students |
| GET | `/admin/users` | `q, status (active\|disabled), page, limit`. Includes each student's transaction count |
| GET | `/admin/users/:id` | Profile plus an activity picture |
| PATCH | `/admin/users/:id` | `{ action: 'disable' \| 'enable' \| 'reset-password' }`. The reset returns a one-time `temporaryPassword` |
| DELETE | `/admin/users/:id` | Removes the account and everything attached to it |
| GET | `/admin/categories` | Default categories with transaction and budget usage counts |
| POST | `/admin/categories` | `name, type, icon?, color?` — shared with all students |
| PUT | `/admin/categories/:id` | `name?, icon?, color?, isArchived?` — rejects blank or duplicate names |
| DELETE | `/admin/categories/:id` | **Archives** instead of deleting when transactions or budgets reference it, preserving student history. The response says which happened via `archived` |
| GET | `/admin/announcements` | `?kind=announcement\|tipTemplate` |
| POST | `/admin/announcements` | `title, body, kind?, active?` |
| PUT | `/admin/announcements/:id` | |
| DELETE | `/admin/announcements/:id` | |

---

## Status codes

| Code | Meaning |
|---|---|
| 200 / 201 | Success |
| 400 | Validation failed — `error` explains what to fix |
| 401 | Missing, invalid or expired token |
| 403 | Wrong role, or the account is disabled |
| 404 | Not found, or not owned by the signed-in user |
| 409 | Conflict — duplicate email or category, or a category still in use |
| 429 | Rate limited (40 auth requests / 15 min, 300 API requests / min) |
| 500 | Server error |

## Rate limits

`/api/auth/*` allows 40 requests per 15 minutes per IP; the rest of `/api` allows 300 per
minute. Both send standard `RateLimit-*` headers.
