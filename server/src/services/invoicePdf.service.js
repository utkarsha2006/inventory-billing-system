import { CreditNote, Shop } from '../models/index.js';
import { generateInvoicePdf } from '../pdf/index.js';
import { fmtDateIST } from '../pdf/helpers.js';
import { ApiError } from '../utils/ApiError.js';
import { getInvoice } from './billing.service.js';

// Roll width is a printer preference, so it comes from current settings (not the snapshot).
async function thermalWidth(shopId, format, widthMm) {
  if (format !== 'thermal' || widthMm) return widthMm;
  const shop = await Shop.findById(shopId).select('invoiceSettings.thermalWidthMm').lean();
  return shop?.invoiceSettings?.thermalWidthMm ?? 80;
}

const fileSafe = (no) => no.replace(/[^A-Za-z0-9._-]+/g, '-'); // INV/2025-26/0001 -> INV-2025-26-0001

export async function getInvoicePdf(shopId, invoiceId, { format = 'a4', widthMm } = {}) {
  const invoice = await getInvoice(shopId, invoiceId); // 404s for other shops' invoices
  const width = await thermalWidth(shopId, format, widthMm);
  const buffer = await generateInvoicePdf(invoice.toObject(), { format, widthMm: width });
  return { buffer, filename: `${fileSafe(invoice.invoiceNo)}${format === 'thermal' ? '-receipt' : ''}.pdf` };
}

// A credit note is drawn by the invoice renderers: same layout, different title and reference line.
function creditNoteToPdfModel(cn) {
  const payments = [];
  if (cn.adjustedAgainstDuePaise > 0) {
    payments.push({ mode: 'Adjusted against dues', amountPaise: cn.adjustedAgainstDuePaise });
  }
  if (cn.refundPaise > 0) {
    payments.push({ mode: cn.refundMode === 'CREDIT_ADJUST' ? 'Store credit' : cn.refundMode, amountPaise: cn.refundPaise });
  }
  return {
    invoiceNo: cn.creditNoteNo,
    invoiceDate: cn.creditNoteDate,
    documentType: cn.originalDocumentType, // decides whether GST columns are drawn
    docTitle: 'CREDIT NOTE',
    refLine: `${cn.invoiceNo} dt ${fmtDateIST(cn.originalInvoiceDate)}`,
    paymentsLabel: 'REFUND',
    supplyType: cn.supplyType,
    placeOfSupplyStateCode: cn.placeOfSupplyStateCode,
    shopSnapshot: cn.shopSnapshot,
    customerSnapshot: cn.customerSnapshot,
    items: cn.items,
    totals: cn.totals,
    taxSummary: cn.taxSummary,
    payments,
    balanceDuePaise: 0,
  };
}

export async function getCreditNotePdf(shopId, creditNoteId, { format = 'a4', widthMm } = {}) {
  const note = await CreditNote.findOne({ _id: creditNoteId, shopId });
  if (!note) throw ApiError.notFound('Credit note not found');
  const width = await thermalWidth(shopId, format, widthMm);
  const buffer = await generateInvoicePdf(creditNoteToPdfModel(note.toObject()), { format, widthMm: width });
  return { buffer, filename: `${fileSafe(note.creditNoteNo)}${format === 'thermal' ? '-receipt' : ''}.pdf` };
}