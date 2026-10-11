// Removes data created by tests that accidentally ran against this database. Dry run by default.
//   node scripts/cleanup-test-data.js          shows what it would delete
//   node scripts/cleanup-test-data.js --yes    deletes it
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Shop, User, Product, ProductBatch, StockMovement, Customer, Supplier, Purchase, Invoice, CreditNote, Counter, RefreshToken } from '../src/models/index.js';

const apply = process.argv.includes('--yes');

async function main() {
  await connectDB();

  // Test shops come from tests/helpers/testApp.js: owner "owner.<digits>@example.com", shop "Shop <digits>".
  // BOTH must match, so a real shop is never touched.
  const owners = await User.find({ email: /^owner\.\d{13,}@example\.com$/, role: 'OWNER' }).select('shopId').lean();
  const shops = await Shop.find({ _id: { $in: owners.map((u) => u.shopId) }, name: /^Shop \d{13,}$/ }).select('name').lean();
  const ids = shops.map((s) => s._id);

  console.log(`Found ${shops.length} test shop(s).`);
  if (!ids.length) return;

  const targets = [
    ['users', User], ['refreshtokens', RefreshToken], ['counters', Counter], ['products', Product],
    ['productbatches', ProductBatch], ['stockmovements', StockMovement], ['customers', Customer],
    ['suppliers', Supplier], ['purchases', Purchase], ['invoices', Invoice], ['creditnotes', CreditNote],
  ];

  for (const [label, Model] of targets) {
    const n = await Model.collection.countDocuments({ shopId: { $in: ids } }); // native driver: bypasses the append-only hooks
    console.log(`  ${label.padEnd(15)} ${n}`);
    if (apply && n) await Model.collection.deleteMany({ shopId: { $in: ids } });
  }

  if (apply) {
    await Shop.collection.deleteMany({ _id: { $in: ids } });
    // Real shops may carry a fake "alert sent today" flag from the test run.
    await Shop.updateMany({}, { $unset: { 'alerts.lastLowStockEmailOn': '' } });
    console.log('\nDeleted. Alert flags reset.');
  } else {
    console.log('\nDry run only. Re-run with --yes to delete.');
  }
}

main().then(() => disconnectDB()).catch(async (e) => { console.error(e); await disconnectDB(); process.exit(1); });