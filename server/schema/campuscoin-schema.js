/**
 * Spendify — database definition script.
 *
 * The MongoDB equivalent of a .sql schema file: it creates every collection with a
 * JSON-Schema validator and builds every index the application relies on.
 *
 * Run it against an empty database before first use (the app also creates these
 * implicitly through Mongoose, so this is for setting up a database by hand, for
 * review, or for restoring structure without data):
 *
 *     mongosh "mongodb://127.0.0.1:27017/campuscoin" server/schema/campuscoin-schema.js
 *
 * It is safe to re-run: existing collections are left in place and indexes are
 * created only if missing.
 */

/* eslint-disable no-undef */

const OID = 'objectId';

function ensure(name, schema) {
  const exists = db.getCollectionNames().includes(name);
  if (exists) {
    db.runCommand({ collMod: name, validator: { $jsonSchema: schema }, validationLevel: 'moderate' });
    print(`  collMod  ${name}`);
  } else {
    db.createCollection(name, { validator: { $jsonSchema: schema }, validationLevel: 'moderate' });
    print(`  created  ${name}`);
  }
}

function index(name, keys, options = {}) {
  db.getCollection(name).createIndex(keys, options);
}

print('\nSpendify — applying schema\n');

/* ------------------------------------------------------------------ users */

ensure('users', {
  bsonType: 'object',
  required: ['name', 'email', 'passwordHash', 'role'],
  properties: {
    name: { bsonType: 'string', maxLength: 80, description: 'Full name of the student' },
    email: { bsonType: 'string', pattern: '^\\S+@\\S+\\.\\S+$', description: 'Login email, unique' },
    passwordHash: { bsonType: 'string', description: 'bcrypt hash — never stored in clear' },
    role: { enum: ['student', 'admin'] },
    academicYear: { bsonType: 'string', maxLength: 40 },
    monthlyAllowance: { bsonType: ['double', 'int'], minimum: 0 },
    savingsGoal: { bsonType: ['double', 'int'], minimum: 0 },
    preferences: {
      bsonType: 'object',
      properties: {
        theme: { enum: ['light', 'dark'] },
        fontScale: { bsonType: ['double', 'int'], minimum: 0.9, maximum: 1.3 },
        currency: { bsonType: 'string' },
        assistantEnabled: { bsonType: 'bool' }
      }
    },
    isDisabled: { bsonType: 'bool' },
    lastLoginAt: { bsonType: 'date' },
    resetTokenHash: { bsonType: 'string' },
    resetTokenExpiresAt: { bsonType: 'date' }
  }
});

index('users', { email: 1 }, { unique: true });
index('users', { role: 1 });

/* ------------------------------------------------------------- categories */

ensure('categories', {
  bsonType: 'object',
  required: ['name', 'type'],
  properties: {
    name: { bsonType: 'string', maxLength: 40 },
    type: { enum: ['income', 'expense'] },
    icon: { bsonType: 'string' },
    color: { bsonType: 'string' },
    isDefault: { bsonType: 'bool', description: 'true = system category shown to every student' },
    owner: { bsonType: [OID, 'null'], description: 'null for system defaults' },
    isArchived: { bsonType: 'bool', description: 'hidden from new entry forms, kept on old entries' }
  }
});

index('categories', { owner: 1, type: 1, name: 1 }, { unique: true });
index('categories', { type: 1 });

/* ----------------------------------------------------------- transactions */

ensure('transactions', {
  bsonType: 'object',
  required: ['user', 'category', 'type', 'amount', 'date'],
  properties: {
    user: { bsonType: OID },
    category: { bsonType: OID },
    type: { enum: ['income', 'expense'] },
    amount: { bsonType: ['double', 'int'], exclusiveMinimum: 0 },
    description: { bsonType: 'string', maxLength: 160 },
    note: { bsonType: 'string', maxLength: 400 },
    date: { bsonType: 'date' },
    source: { enum: ['manual', 'csv', 'recurring'] },
    isRecurring: { bsonType: 'bool' },
    recurrence: {
      bsonType: ['object', 'null'],
      properties: {
        frequency: { enum: ['weekly', 'monthly'] },
        nextRunOn: { bsonType: 'date' },
        endsOn: { bsonType: ['date', 'null'] },
        active: { bsonType: 'bool' }
      }
    },
    generatedFrom: { bsonType: [OID, 'null'] },
    suggestedCategory: { bsonType: [OID, 'null'] },
    suggestionAccepted: { bsonType: ['bool', 'null'] },
    flags: {
      bsonType: 'object',
      properties: {
        unusuallyLarge: { bsonType: 'bool' },
        possibleDuplicate: { bsonType: 'bool' }
      }
    },
    deletedAt: { bsonType: ['date', 'null'], description: 'soft delete — null means live' }
  }
});

index('transactions', { user: 1, date: -1 });
index('transactions', { user: 1, category: 1, date: -1 });
index('transactions', { user: 1, type: 1 });
index('transactions', { deletedAt: 1 });

/* ---------------------------------------------------------------- budgets */

ensure('budgets', {
  bsonType: 'object',
  required: ['user', 'category', 'month', 'limitAmount'],
  properties: {
    user: { bsonType: OID },
    category: { bsonType: OID },
    month: { bsonType: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' },
    limitAmount: { bsonType: ['double', 'int'], minimum: 0 },
    alertsSent: { bsonType: 'array', items: { bsonType: ['double', 'int'] } }
  }
});

index('budgets', { user: 1, category: 1, month: 1 }, { unique: true });

/* --------------------------------------------------------------- insights */

ensure('insights', {
  bsonType: 'object',
  required: ['user', 'month', 'summaryText'],
  properties: {
    user: { bsonType: OID },
    month: { bsonType: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' },
    summaryText: { bsonType: 'string' },
    tipText: { bsonType: 'string' },
    highlights: { bsonType: 'array' },
    stats: { bsonType: 'object' },
    bookmarked: { bsonType: 'bool' },
    generatedAt: { bsonType: 'date' }
  }
});

index('insights', { user: 1, month: 1 }, { unique: true });

/* ------------------------------------------------------------------- tips */

ensure('tips', {
  bsonType: 'object',
  required: ['user', 'key', 'title', 'body'],
  properties: {
    user: { bsonType: OID },
    key: { bsonType: 'string', description: 'stable identity, e.g. overspend:<categoryId>' },
    title: { bsonType: 'string' },
    body: { bsonType: 'string' },
    category: { bsonType: [OID, 'null'] },
    potentialSaving: { bsonType: ['double', 'int'], description: 'ranking key' },
    status: { enum: ['active', 'pinned', 'dismissed'] },
    bookmarked: { bsonType: 'bool' },
    month: { bsonType: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' },
    lastSeenAt: { bsonType: 'date' }
  }
});

index('tips', { user: 1, key: 1 }, { unique: true });

/* ---------------------------------------------------------- categoryhints */

ensure('categoryhints', {
  bsonType: 'object',
  required: ['user', 'token', 'category'],
  properties: {
    user: { bsonType: OID },
    token: { bsonType: 'string', description: 'one lower-cased word from a description' },
    category: { bsonType: OID },
    weight: { bsonType: ['double', 'int'] }
  }
});

index('categoryhints', { user: 1, token: 1, category: 1 }, { unique: true });

/* ----------------------------------------------------------- activitylogs */

ensure('activitylogs', {
  bsonType: 'object',
  required: ['user', 'action'],
  properties: {
    user: { bsonType: OID },
    transaction: { bsonType: [OID, 'null'] },
    action: { enum: ['created', 'viewed', 'updated', 'deleted', 'restored', 'imported'] },
    changes: { bsonType: 'array', items: { bsonType: 'string' } },
    snapshot: { bsonType: 'object' },
    createdAt: { bsonType: 'date' }
  }
});

index('activitylogs', { user: 1, createdAt: -1 });
index('activitylogs', { transaction: 1 });

/* ---------------------------------------------------------- notifications */

ensure('notifications', {
  bsonType: 'object',
  required: ['user', 'title'],
  properties: {
    user: { bsonType: OID },
    title: { bsonType: 'string' },
    body: { bsonType: 'string' },
    level: { enum: ['info', 'warn', 'danger'] },
    link: { bsonType: 'string' },
    read: { bsonType: 'bool' }
  }
});

index('notifications', { user: 1, createdAt: -1 });

/* ---------------------------------------------------------- announcements */

ensure('announcements', {
  bsonType: 'object',
  required: ['title', 'body'],
  properties: {
    title: { bsonType: 'string', maxLength: 120 },
    body: { bsonType: 'string', maxLength: 1000 },
    kind: { enum: ['announcement', 'tipTemplate'] },
    active: { bsonType: 'bool' },
    createdBy: { bsonType: [OID, 'null'] }
  }
});

index('announcements', { kind: 1 });

print('\nSchema applied. Run `npm run seed` in server/ to load the default categories,');
print('an administrator account and the demo students.\n');
