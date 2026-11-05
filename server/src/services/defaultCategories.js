const Category = require('../models/Category');
const SystemSetting = require('../models/SystemSetting');
const { DEFAULT_CATEGORIES } = require('../config/defaults');

async function ensureDefaultCategories() {
  const settings = await SystemSetting.findOne({ scope: 'global' }).select('defaultCategoriesInitialized').lean();
  if (settings?.defaultCategoriesInitialized) return 0;

  let created = 0;
  for (const category of DEFAULT_CATEGORIES) {
    const result = await Category.updateOne(
      { name: category.name, type: category.type, isDefault: true, owner: null },
      { $setOnInsert: { ...category, isDefault: true, owner: null } },
      { upsert: true }
    );
    if (result.upsertedCount) created += 1;
  }

  await SystemSetting.updateOne(
    { scope: 'global' },
    { $set: { defaultCategoriesInitialized: true } },
    { upsert: true }
  );

  return created;
}

module.exports = { ensureDefaultCategories };
