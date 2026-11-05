# Spendify — test data and user credentials

Everything here is created by `npm run seed` in `server/`. Re-running is safe; adding
`--fresh` clears every collection first.

---

## User credentials (all types)

| Role | Email | Password | What they see |
|---|---|---|---|
| **Administrator** | `admin@campuscoin.app` | `Admin@123` | Control panel at `/admin` — default categories, students, announcements, statistics |
| **Student** | `ayesha@student.campuscoin.app` | `Student@123` | 2nd year, allowance 400, savings goal 80. ~290 transactions over six months |
| **Student** | `daniyal@student.campuscoin.app` | `Student@123` | 4th year, allowance 520, savings goal 120. ~397 transactions, spends about 25% more |

Students sign in at `/login`. The administrator has a separate entrance at `/admin/login`
and cannot be reached through the student form (and vice versa) — the server rejects the
mismatch with a 403.

The administrator email and password can be changed in `server/.env` before seeding via
`ADMIN_EMAIL` and `ADMIN_PASSWORD`.

---

## What the seed creates

### Default categories (12)

**Income** — Allowance, Part-time Job, Scholarship, Gift, Other Income
**Expense** — Food, Transport, Hostel/Rent, Academics, Subscriptions, Entertainment,
Miscellaneous

Each has its own icon and colour, matching the categories named in the SRS.

### Announcements and tip templates

One active announcement (shown as a banner on every student dashboard) and three tip
templates, which appear in the tips feed for accounts with fewer than ten transactions.

### Transaction history

Six months ending with the current one, generated from realistic student patterns:

| Category | Entries per month | Typical amount |
|---|---|---|
| Food | 18–26 | 3–14 |
| Transport | 6–11 | 2–18 |
| Hostel/Rent | 1–2 | 120–190 |
| Academics | 2–5 | 5–55 |
| Subscriptions | 2–4 | 4–12 |
| Entertainment | 3–6 | 5–25 |
| Miscellaneous | 1–4 | 3–22 |

Income: a monthly allowance on the 2nd (always), a part-time shift on the 15th (80% of
months), a scholarship instalment on the 8th (35%), and an occasional gift (25%).

**Food and Entertainment are deliberately inflated by 35% in the last two months.** That
is what gives the insight writer and the tips engine something real to flag, so the
"spending rose 40% this month" behaviour is visible in a demo rather than theoretical.

The generator uses a fixed seed, so every run produces the same data and screenshots
stay reproducible.

### Budgets (current month)

Food 180, Transport 60, Entertainment 70, Subscriptions 30, Academics 80 — scaled by the
student's spending appetite. Because of the deliberate overspend above, at least one
budget is over its limit on first load, so the progress bars, the "Over" chip and the
notification bell all have something to show.

### Recurring rule

One monthly subscription charge (9.99) per student, due on the 5th, so the recurring
feature is visible without setting one up by hand.

### Derived data

Insights for the last three months, the current month's tips, budget alerts and anomaly
flags are all generated **through the real services** — not inserted as fixtures — so
what you see in a fresh database is exactly what the application produces.

---

## Sample CSV for testing the importer

Save as `test-import.csv`. The Import CSV screen also offers this as a download.

```csv
date,description,amount,type,category
2026-09-02,Monthly allowance from home,400,income,Allowance
2026-09-03,Campus Cafe lunch,6.50,expense,Food
04/09/2026,Metro card top up,20,expense,
2026-09-05,Data structures textbook,45,expense,Academics
2026-09-06,Streaming subscription,9.99,expense,
2026-09-07,Dinner with roommates,18.40,expense,
not-a-date,,,,
```

Expected result: six rows read, one skipped (the malformed line, reported by line
number), and a category proposed for the three rows that left it blank — Transport,
Subscriptions and Food respectively.

---

## Scenarios worth demonstrating

| Feature | How to show it |
|---|---|
| Category suggestion learning | Add an expense described "Campus Cafe lunch" — Food is suggested with its confidence and the words it matched. Override it to Entertainment, save, then add another "Campus Cafe" entry: the suggestion has shifted |
| Budget alert | Open Budgets, set Food to a figure below what is already spent, then open the notification bell |
| Over-budget in reports | Reports → Budget performance; the seeded Food budget is already over |
| Monthly insight | Insights → Rebuild summary. The narrative names the inflated Food and Entertainment categories with real percentages |
| Tips ranking | Saving Tips — the list is sorted by potential saving, and the hero figure totals them |
| Soft delete and history | Transactions → delete an entry → "Deleted" panel → Restore. The clock icon on any row shows its full audit trail |
| Anomaly detection | Transactions → "Flagged" — unusually large amounts and probable duplicates |
| Recurring | Transactions → "Recurring" shows the seeded subscription with its next run date |
| Export | Reports → PDF or Image |
| Admin archive rule | Control panel → Default Categories → delete "Food": it is archived instead, because transactions reference it |
| Disabled account | Control panel → Students → Disable one, then try signing in as them |
| Accessibility | Topbar text-size and dark-mode buttons; both persist to the account |
