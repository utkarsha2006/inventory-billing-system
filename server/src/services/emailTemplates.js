import { fmtDateIST } from '../pdf/helpers.js';

// Product names are user input, so everything is escaped before it goes into HTML.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TD = 'padding:6px 10px;border-bottom:1px solid #e5e7eb;';
const table = (headers, rows) =>
  `<table style="border-collapse:collapse;font-size:14px;width:100%">` +
  `<tr>${headers.map((h) => `<th style="${TD}text-align:left;background:#f3f4f6">${esc(h)}</th>`).join('')}</tr>` +
  rows.map((r) => `<tr>${r.map((c) => `<td style="${TD}">${esc(c)}</td>`).join('')}</tr>`).join('') +
  `</table>`;

export function buildAlertEmail({ shopName, alerts, now = new Date() }) {
  const date = fmtDateIST(now);
  const name = String(shopName ?? 'Your shop').replace(/[\r\n]+/g, ' ');
  const subject = `[${name}] Stock alert: ${alerts.lowStockCount} low, ${alerts.expiringCount} expiring (${date})`;

  const lowMore = alerts.lowStockCount - alerts.lowStock.length;
  const expMore = alerts.expiringCount - alerts.expiring.length;
  const expiryNote = (b) => (b.expired ? 'EXPIRED' : fmtDateIST(b.expiryDate));

  const text = [
    `Stock alert for ${name} - ${date}`,
    '',
    ...(alerts.lowStock.length
      ? [
          `LOW STOCK (${alerts.lowStockCount})`,
          ...alerts.lowStock.map((p) => `- ${p.name} (${p.sku}): ${p.stockQty} ${p.unit} left, reorder at ${p.reorderLevel}`),
          ...(lowMore > 0 ? [`...and ${lowMore} more`] : []),
          '',
        ]
      : []),
    ...(alerts.expiring.length
      ? [
          `EXPIRING WITHIN ${alerts.expiryDays} DAYS OR EXPIRED (${alerts.expiringCount})`,
          ...alerts.expiring.map((b) => `- ${b.name}, batch ${b.batchNo}: ${b.qtyRemaining} ${b.unit}, ${expiryNote(b)}`),
          ...(expMore > 0 ? [`...and ${expMore} more`] : []),
        ]
      : []),
  ].join('\n');

  const html =
    `<div style="font-family:Arial,sans-serif;color:#111827;max-width:640px">` +
    `<h2 style="margin:0 0 4px">Stock alert</h2><p style="margin:0 0 16px;color:#6b7280">${esc(name)} &middot; ${esc(date)}</p>` +
    (alerts.lowStock.length
      ? `<h3>Low stock (${alerts.lowStockCount})</h3>` +
        table(['Item', 'SKU', 'In stock', 'Reorder at'], alerts.lowStock.map((p) => [p.name, p.sku, `${p.stockQty} ${p.unit}`, p.reorderLevel])) +
        (lowMore > 0 ? `<p>...and ${lowMore} more</p>` : '')
      : '') +
    (alerts.expiring.length
      ? `<h3>Expiring within ${alerts.expiryDays} days or expired (${alerts.expiringCount})</h3>` +
        table(['Item', 'Batch', 'Qty', 'Expiry'], alerts.expiring.map((b) => [b.name, b.batchNo, `${b.qtyRemaining} ${b.unit}`, expiryNote(b)])) +
        (expMore > 0 ? `<p>...and ${expMore} more</p>` : '')
      : '') +
    `</div>`;

  return { subject, text, html };
}