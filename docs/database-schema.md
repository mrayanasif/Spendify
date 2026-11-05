# Spendify — database design

MongoDB, accessed through Mongoose. Ten collections. Every student-owned document
carries a `user` reference and is queried through it, which is what keeps one student's
data unreachable from another account.

The executable definition of everything below lives in
[`server/schema/campuscoin-schema.js`](../server/schema/campuscoin-schema.js), which
creates the collections, applies validators and builds the indexes on an empty database.

---

## Entity relationships

```
                  ┌─────────────┐
                  │    User     │
                  └──────┬──────┘
                         │ 1
        ┌────────────┬───┴────┬─────────────┬──────────────┬───────────────┐
        │ n          │ n      │ n           │ n            │ n             │ n
 ┌──────▼──────┐ ┌───▼────┐ ┌─▼────────┐ ┌──▼───────┐ ┌────▼─────────┐ ┌───▼──────────┐
 │ Transaction │ │ Budget │ │ Insight  │ │   Tip    │ │ Notification │ │ CategoryHint │
 └──────┬──────┘ └───┬────┘ └──────────┘ └────┬─────┘ └──────────────┘ └───┬──────────┘
        │ n          │ n                      │ n                          │ n
        └────────────┴──────────┬─────────────┴────────────────────────────┘
                                │ 1
                         ┌──────▼──────┐        ┌──────────────┐   ┌──────────────┐
                         │  Category   │        │ ActivityLog  │   │ Announcement │
                         └─────────────┘        └──────────────┘   └──────────────┘
                     (owner: User | null            (User 1─n)      (admin-authored,
                      when it is a system                            no owner)
                      default)
```

A `Category` is either a **system default** (`isDefault: true`, `owner: null`, visible to
everyone, managed by an admin) or **personal** (`owner` set). Both are selectable when
logging a transaction, which is why `owner` is nullable rather than a separate collection.

---

## Collections

### `users`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `name` | String | Required, max 80 |
| `email` | String | Required, **unique**, lower-cased |
| `passwordHash` | String | bcrypt, cost 10. `select: false` — never returned by default |
| `role` | String | `student` \| `admin`, indexed |
| `academicYear` | String | Optional profile field |
| `monthlyAllowance` | Number | Baseline used in tips |
| `savingsGoal` | Number | Target used by tips and the dashboard ring |
| `preferences.theme` | String | `light` \| `dark` |
| `preferences.fontScale` | Number | 0.9 – 1.3 |
| `preferences.currency` | String | Display symbol only |
| `preferences.assistantEnabled` | Boolean | Turns category suggestions off |
| `isDisabled` | Boolean | Set by an admin; blocks sign-in |
| `lastLoginAt` | Date | Drives the "active students" statistic |
| `resetTokenHash` | String | SHA-256 of the reset token, `select: false` |
| `resetTokenExpiresAt` | Date | 30 minutes after issue |
| `createdAt`, `updatedAt` | Date | Timestamps |

Indexes: `{ email: 1 }` unique, `{ role: 1 }`.

### `categories`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | String | Required, max 40 |
| `type` | String | `income` \| `expense`, indexed |
| `icon` | String | Key into the app's icon set |
| `color` | String | Hex, used throughout the charts |
| `isDefault` | Boolean | True for the system set |
| `owner` | ObjectId → users | `null` for defaults |
| `isArchived` | Boolean | Hidden from new entry forms, kept on old entries |

Indexes: `{ owner: 1, type: 1, name: 1 }` unique, `{ type: 1 }`.

### `transactions`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `user` | ObjectId → users | Required, indexed |
| `category` | ObjectId → categories | Required |
| `type` | String | `income` \| `expense` |
| `amount` | Number | Required, > 0 |
| `description` | String | Free text, feeds the suggestion engine |
| `note` | String | Optional longer note |
| `date` | Date | The transaction date, indexed |
| `source` | String | `manual` \| `csv` \| `recurring` |
| `isRecurring` | Boolean | True on a **rule**, not on what it generates |
| `recurrence.frequency` | String | `weekly` \| `monthly` |
| `recurrence.nextRunOn` | Date | When the next entry is due |
| `recurrence.endsOn` | Date | Optional stop date |
| `recurrence.active` | Boolean | |
| `generatedFrom` | ObjectId → transactions | Set on entries a rule created |
| `suggestedCategory` | ObjectId → categories | What the assistant proposed |
| `suggestionAccepted` | Boolean | Whether the student kept it |
| `flags.unusuallyLarge` | Boolean | Set by the anomaly check |
| `flags.possibleDuplicate` | Boolean | Set by the anomaly check |
| `deletedAt` | Date | **Soft delete.** `null` means live |

Indexes: `{ user: 1, date: -1 }`, `{ user: 1, category: 1, date: -1 }`, `{ type: 1 }`,
`{ deletedAt: 1 }`.

Every report query filters `deletedAt: null`, so a deleted entry leaves the figures but
stays restorable — this is how "retaining the full history" is implemented.

### `budgets`

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId → users | Indexed |
| `category` | ObjectId → categories | Expense categories only |
| `month` | String | `YYYY-MM` |
| `limitAmount` | Number | The cap |
| `alertsSent` | [Number] | Thresholds already notified, e.g. `[80, 100]` |

Index: `{ user: 1, category: 1, month: 1 }` unique.

`alertsSent` is why a student gets one warning per threshold per month instead of one per
purchase. Dropping back under a threshold clears it, so a corrected entry re-arms it.

### `insights`

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId → users | Indexed |
| `month` | String | `YYYY-MM` |
| `summaryText` | String | The generated narrative |
| `tipText` | String | The actionable suggestion |
| `highlights` | [{ label, value, direction, tone }] | Dashboard chips |
| `stats` | Mixed | Totals and per-category figures behind the text |
| `bookmarked` | Boolean | Survives regeneration |
| `generatedAt` | Date | |

Index: `{ user: 1, month: 1 }` unique.

### `tips`

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId → users | Indexed |
| `key` | String | Stable identity, e.g. `overspend:<categoryId>` |
| `title`, `body` | String | |
| `category` | ObjectId → categories | Optional |
| `potentialSaving` | Number | **What the list is ranked by** |
| `status` | String | `active` \| `pinned` \| `dismissed` |
| `bookmarked` | Boolean | |
| `month` | String | `YYYY-MM` |

Index: `{ user: 1, key: 1 }` unique — so regenerating refreshes the numbers without
resurrecting something the student dismissed.

### `categoryhints`

The learned half of the categorisation assistant. One row per (student, word, category).

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId → users | Indexed |
| `token` | String | A single lower-cased word |
| `category` | ObjectId → categories | |
| `weight` | Number | +1 each time the word is saved under this category, −0.5 when overridden away from it |

Index: `{ user: 1, token: 1, category: 1 }` unique.

### `activitylogs`

Append-only trail behind both the per-entry history and the "recently viewed / recently
edited" lists.

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId → users | Indexed |
| `transaction` | ObjectId → transactions | Indexed |
| `action` | String | `created` \| `viewed` \| `updated` \| `deleted` \| `restored` \| `imported` |
| `changes` | [String] | Which fields changed |
| `snapshot` | Mixed | Values at the time of the action |
| `createdAt` | Date | |

Index: `{ user: 1, createdAt: -1 }`.

### `notifications`

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId → users | Indexed |
| `title`, `body` | String | |
| `level` | String | `info` \| `warn` \| `danger` |
| `link` | String | Where the bell sends the student |
| `read` | Boolean | |

Index: `{ user: 1, createdAt: -1 }`.

### `announcements`

Admin-authored, not owned by any student.

| Field | Type | Notes |
|---|---|---|
| `title`, `body` | String | |
| `kind` | String | `announcement` (dashboard banner) \| `tipTemplate` (generic advice for new accounts) |
| `active` | Boolean | Drafts are `false` |
| `createdBy` | ObjectId → users | The administrator |

Index: `{ kind: 1 }`.

---

## Design decisions worth explaining

**Months are `YYYY-MM` strings, not dates.** Budgets, insights and tips are all
month-scoped. A string makes the uniqueness constraint exact, avoids every timezone
question, and sorts correctly as text. Transaction dates stay real `Date` values because
they need range queries and day-level aggregation.

**Soft delete on transactions only.** Reports and history need deleted rows to still
exist; nothing else does. Budgets, tips and categories are removed outright.

**Denormalised `type` on transactions.** It duplicates the category's `type`, but it lets
every aggregation group by type without a `$lookup`, and the controller validates the two
agree on write.

**A default category in use is archived, never deleted.** Deleting it would orphan the
label on every student's history, so `isArchived` hides it from new entry forms while old
entries keep their name and colour.

**`CategoryHint` is a separate collection, not an array on the user.** Weights are updated
with targeted `$inc` upserts on every save and read with one indexed `$in` query, which
stays fast as a student's vocabulary grows.
