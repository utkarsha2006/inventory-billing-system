import { Shop } from '../models/index.js';
import { generateInvoicePdf } from '../pdf/index.js';
import { getInvoice } from './billing.service.js';

export async function getInvoicePdf(shopId, invoiceId, { format = 'a4', widthMm } = {}) {
  const invoice = await getInvoice(shopId, invoiceId); // 404s for other shops' invoices

  let width = widthMm;
  if (format === 'thermal' && !width) {
    // Roll width is a printer preference, so it comes from current settings (not the invoice snapshot).
    const shop = await Shop.findById(shopId).select('invoiceSettings.thermalWidthMm').lean();
    width = shop?.invoiceSettings?.thermalWidthMm ?? 80;
  }

  const buffer = await generateInvoicePdf(invoice.toObject(), { format, widthMm: width });
  const safeNo = invoice.invoiceNo.replace(/[^A-Za-z0-9._-]+/g, '-'); // INV/2025-26/0001 -> INV-2025-26-0001
  return { buffer, filename: `${safeNo}${format === 'thermal' ? '-receipt' : ''}.pdf` };
}