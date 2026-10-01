import PDFDocument from 'pdfkit';
import { registerFonts } from './fonts.js';
import { mmToPt } from './helpers.js';
import { renderInvoiceA4 } from './invoiceA4.js';
//import { renderInvoiceThermal } from './invoiceThermal.js';

const collect = (doc) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

const info = (invoice) => ({
  Title: invoice.invoiceNo,
  Author: invoice.shopSnapshot?.name ?? '',
  Subject: invoice.documentType === 'TAX_INVOICE' ? 'Tax Invoice' : 'Bill of Supply',
});

/**
 * Pure rendering: takes a plain invoice object, returns a PDF Buffer. No database access.
 * format: 'a4' | 'thermal'   widthMm: 58 | 80 (thermal only)
 */
export async function generateInvoicePdf(invoice, { format = 'a4', widthMm = 80 } = {}) {
  if (format === 'thermal') {
    const pageWidth = mmToPt(widthMm);

    // Pass 1: lay out on a very tall page just to measure the content height.
    const probe = new PDFDocument({ size: [pageWidth, 14000], margin: 0 });
    probe.on('data', () => {}); // drain
    const contentHeight = renderInvoiceThermal(probe, invoice, registerFonts(probe));
    probe.end();

    // Pass 2: render again on a page of exactly that height (one page, no wasted paper).
    const doc = new PDFDocument({ size: [pageWidth, Math.ceil(contentHeight) + 8], margin: 0, info: info(invoice) });
    const done = collect(doc);
    renderInvoiceThermal(doc, invoice, registerFonts(doc));
    doc.end();
    return done;
  }

  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true, info: info(invoice) });
  const done = collect(doc);
  renderInvoiceA4(doc, invoice, registerFonts(doc));
  doc.end();
  return done;
}