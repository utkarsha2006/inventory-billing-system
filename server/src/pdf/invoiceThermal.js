import { amountInWords } from '../utils/numberToWords.js';
import { fmtAmount, fmtDateIST, fmtTimeIST, fmtQty, stateLabel } from './helpers.js';

const M = 8;

// Draws a receipt top-to-bottom and RETURNS the final height in points, so the caller can render a
// second time on a page of exactly that height. Works for 58mm and 80mm rolls.
export function renderInvoiceThermal(doc, inv, f) {
  const W = doc.page.width - 2 * M;
  const base = W > 170 ? 8 : 7;
  const taxable = inv.documentType === 'TAX_INVOICE';
  const inter = inv.supplyType === 'INTER';
  const shop = inv.shopSnapshot ?? {};
  const cust = inv.customerSnapshot ?? {};
  const totals = inv.totals;
  const rupee = f.rupee;
  const s = f.safe;
  let y = 10;

  const setFont = (font, size) => doc.font(font).fontSize(size).fillColor('#000000');

  const block = (str, { font = f.regular, size = base, align = 'left', gap = 1.5 } = {}) => {
    if (!str) return;
    setFont(font, size);
    const text = s(str);
    const h = doc.heightOfString(text, { width: W, align });
    doc.text(text, M, y, { width: W, align });
    y += h + gap;
  };

  // Left text (wraps) and right text (value) on one row.
  const lr = (left, right, { font = f.regular, size = base } = {}) => {
    setFont(font, size);
    const l = s(left);
    const r = s(right);
    const rw = Math.ceil(doc.widthOfString(r)) + 2;
    const lw = Math.max(W - rw - 4, 24);
    const hl = doc.heightOfString(l, { width: lw });
    const hr = doc.heightOfString(r, { width: rw + 4 });
    doc.text(l, M, y, { width: lw });
    doc.text(r, M + W - rw, y, { width: rw + 4, lineBreak: false });
    y += Math.max(hl, hr) + 1.5;
  };

  const rule = () => {
    y += 1;
    doc.moveTo(M, y).lineTo(M + W, y).dash(2, { space: 2 }).lineWidth(0.5).strokeColor('#000000').stroke().undash();
    y += 4;
  };

  // ---- Shop header ----
  const a = shop.address ?? {};
  block(shop.name, { font: f.bold, size: base + 4, align: 'center', gap: 2 });
  block([a.line1, a.line2, [a.city, a.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '), { align: 'center' });
  block(shop.phone && `Ph: ${shop.phone}`, { align: 'center' });
  block(shop.gstin && `GSTIN: ${shop.gstin}`, { font: f.bold, align: 'center' });
  if (shop.gstRegistrationType === 'COMPOSITION') {
    block('Composition taxable person, not eligible to collect tax on supplies', { size: base - 1, align: 'center' });
  }
  rule();

  block(inv.docTitle ?? (taxable ? 'TAX INVOICE' : 'BILL OF SUPPLY'), { font: f.bold, size: base + 2, align: 'center', gap: 3 });
  lr(inv.docTitle ? 'CN No' : 'Inv No', inv.invoiceNo, { font: f.bold });
  if (inv.refLine) block(`Against: ${inv.refLine}`);
  lr('Date', `${fmtDateIST(inv.invoiceDate)} ${fmtTimeIST(inv.invoiceDate)}`);
  if (cust.name) lr('Customer', cust.name);
  if (cust.gstin) lr('GSTIN', cust.gstin);
  if (taxable) lr('Supply to', stateLabel(inv.placeOfSupplyStateCode));
  rule();

  // ---- Items ----
  lr('Item', `Amount (${rupee})`, { font: f.bold });
  rule();
  let anyInclusive = false;
  for (const it of inv.items) {
    const incl = it.priceIncludesGst && it.gstRate > 0;
    if (incl) anyInclusive = true;
    const disc = it.discountPaise + it.billDiscountSharePaise;

    block(it.name, { font: f.bold, gap: 0.5 });
    for (const b of it.batches ?? []) {
      block(`Batch ${b.batchNo}  Exp ${fmtDateIST(b.expiryDate)}`, { size: base - 1, gap: 0.5 });
    }
    lr(`${fmtQty(it.qtyMilli)} ${it.unit ?? ''} x ${fmtAmount(it.unitPricePaise)}${incl ? '*' : ''}`, fmtAmount(it.lineTotalPaise));
    if (disc > 0) block(`Discount applied: ${fmtAmount(disc)}`, { size: base - 1 });
    y += 1.5;
  }
  if (anyInclusive) block('* Rate includes GST', { size: base - 1 });
  rule();

  // ---- Totals ----
  const discount = totals.itemDiscountPaise + totals.billDiscountPaise;
  lr(taxable ? 'Taxable Value' : 'Sub Total', fmtAmount(totals.taxablePaise));
  if (discount > 0) lr('Discount (applied)', fmtAmount(discount));
  if (taxable) {
    if (totals.cgstPaise > 0 || totals.sgstPaise > 0) {
      lr('CGST', fmtAmount(totals.cgstPaise));
      lr('SGST', fmtAmount(totals.sgstPaise));
    }
    if (totals.igstPaise > 0) lr('IGST', fmtAmount(totals.igstPaise));
  }
  if (totals.roundOffPaise !== 0) lr('Round Off', fmtAmount(totals.roundOffPaise));
  y += 2;
  lr('TOTAL', `${rupee} ${fmtAmount(totals.grandTotalPaise)}`, { font: f.bold, size: base + 4 });
  y += 1;
  block(amountInWords(totals.grandTotalPaise), { size: base - 0.5, gap: 2 });
  rule();

  // ---- Payments (refunds, for a credit note) ----
  for (const p of inv.payments ?? []) {
    lr(`${inv.docTitle ? 'Refund' : 'Paid'}: ${p.mode}${p.reference ? ` (${p.reference})` : ''}`, fmtAmount(p.amountPaise));
  }
  if (inv.balanceDuePaise > 0) lr('BALANCE DUE', fmtAmount(inv.balanceDuePaise), { font: f.bold });

  // ---- Compact tax breakup (a vertical list, so it fits both 58mm and 80mm) ----
  if (taxable && inv.taxSummary?.length) {
    rule();
    block('Tax Breakup', { font: f.bold, align: 'center', gap: 2 });
    for (const t of inv.taxSummary) {
      lr(`HSN ${t.hsnCode || '-'}  GST ${t.gstRate}%`, `Taxable ${fmtAmount(t.taxablePaise)}`);
      if (inter) {
        lr(`IGST ${t.gstRate}%: ${fmtAmount(t.igstPaise)}`, '', { size: base - 0.5 });
      } else {
        lr(`CGST ${t.gstRate / 2}%: ${fmtAmount(t.cgstPaise)}`, `SGST ${t.gstRate / 2}%: ${fmtAmount(t.sgstPaise)}`, {
          size: base - 0.5,
        });
      }
    }
  }

  rule();
  block(shop.footerNote || 'Thank you for your business!', { align: 'center' });
  block('Computer-generated invoice', { size: base - 1, align: 'center' });

  return y + 6;
}