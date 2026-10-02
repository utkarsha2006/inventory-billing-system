import cron from 'node-cron';
import { Shop, User } from '../models/index.js';
import { collectShopAlerts } from '../services/alert.service.js';
import { buildAlertEmail } from '../services/emailTemplates.js';
import { isMailConfigured, sendMail } from '../services/email.service.js';
import { istYmd } from '../utils/financialYear.js';

async function alertOneShop(shop, today, now) {
  const alerts = await collectShopAlerts(shop._id, { now });
  if (!alerts.hasAlerts) return 'skipped';

  const owner = await User.findById(shop.ownerId).select('email isActive').lean();
  if (!owner?.isActive) return 'skipped';

  if (!isMailConfigured()) {
    console.log(`[alerts] SMTP not configured: would email ${owner.email} (${alerts.lowStockCount} low, ${alerts.expiringCount} expiring)`);
    return 'skipped';
  }

  // Claim today's send atomically BEFORE sending: if the cron and an external trigger fire
  // together, exactly one of them gets modifiedCount === 1.
  const claim = await Shop.updateOne(
    { _id: shop._id, 'alerts.lastLowStockEmailOn': { $ne: today } },
    { $set: { 'alerts.lastLowStockEmailOn': today } }
  );
  if (claim.modifiedCount === 0) return 'skipped';

  try {
    await sendMail({ to: owner.email, ...buildAlertEmail({ shopName: shop.name, alerts, now }) });
    return 'sent';
  } catch (err) {
    // Release the claim so the next trigger can retry.
    await Shop.updateOne({ _id: shop._id, 'alerts.lastLowStockEmailOn': today }, { $unset: { 'alerts.lastLowStockEmailOn': '' } });
    throw err;
  }
}

export async function runLowStockAlerts({ now = new Date() } = {}) {
  const today = istYmd(now);
  const summary = { shops: 0, sent: 0, skipped: 0, failed: 0 };

  for await (const shop of Shop.find().select('name ownerId').lean().cursor()) {
    summary.shops += 1;
    try {
      summary[await alertOneShop(shop, today, now)] += 1; // one shop failing never stops the others
    } catch (err) {
      summary.failed += 1;
      console.error(`[alerts] shop ${shop._id}: ${err.message}`);
    }
  }
  return summary;
}

// Returns a stop function. 08:00 India time, regardless of the server's timezone.
export function scheduleLowStockAlerts() {
  const task = cron.schedule(
    '0 8 * * *',
    () => {
      runLowStockAlerts()
        .then((s) => console.log('[alerts] daily run', s))
        .catch((e) => console.error('[alerts] daily run failed', e));
    },
    { timezone: 'Asia/Kolkata' }
  );
  return () => task.stop();
}