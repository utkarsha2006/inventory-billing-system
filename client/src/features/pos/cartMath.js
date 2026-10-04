import { FRACTIONAL_UNITS } from '../../utils/constants.js';
import { formatMoney, parseMoney } from '../../utils/format.js';

export function parseQty(unit, text) {
  const t = String(text ?? '').trim();
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(t)) return { error: 'Enter a quantity (up to 3 decimals)' };
  const qty = Number(t);
  if (!(qty > 0)) return { error: 'Quantity must be above 0' };
  if (!FRACTIONAL_UNITS.includes(unit) && !Number.isInteger(qty)) return { error: `Whole numbers only for ${unit}` };
  return { qty };
}

export const unitPricePaise = (line) => (line.priceText !== '' ? parseMoney(line.priceText).paise : line.pricePaise);

// Rounds DOWN, so a local estimate can never exceed the server's rounded line amount.
export const grossFloor = (qty, pricePaise) => Number((BigInt(Math.round(qty * 1000)) * BigInt(pricePaise)) / 1000n);

// What a percentage bill discount applies to: the lines after their own discounts.
export function billBase(pos) {
  return pos.lines.reduce((sum, l) => {
    const q = parseQty(l.unit, l.qtyText);
    if (q.error) return sum;
    const d = parseMoney(l.discountText);
    return sum + Math.max(grossFloor(q.qty, unitPricePaise(l)) - (d.valid ? d.paise : 0), 0);
  }, 0);
}

const PCT = /^\d{1,3}(\.\d{1,2})?$/;

export function billDiscountPaise(pos) {
  const { mode, value } = pos.billDiscount;
  const text = String(value).trim();
  if (text === '') return 0;
  if (mode === 'percent') {
    if (!PCT.test(text) || Number(text) > 100) return 0;
    return Math.floor((billBase(pos) * Math.round(Number(text) * 100)) / 10000); // basis points, integer maths
  }
  const m = parseMoney(text);
  return m.valid ? m.paise : 0;
}

// Problems that must be fixed before the server is asked for totals.
export function cartIssues(pos) {
  const out = [];
  for (const l of pos.lines) {
    const q = parseQty(l.unit, l.qtyText);
    if (q.error) out.push(`${l.name}: ${q.error}`);
    if (!parseMoney(l.discountText).valid) out.push(`${l.name}: discount must be an amount like 10 or 10.50`);
    if (l.priceText !== '') {
      const p = parseMoney(l.priceText);
      if (!p.valid || p.paise < 1) out.push(`${l.name}: enter a valid price`);
    }
  }
  const { mode, value } = pos.billDiscount;
  const text = String(value).trim();
  if (text !== '') {
    if (mode === 'percent') {
      if (!PCT.test(text) || Number(text) > 100) out.push('Bill discount must be between 0 and 100%');
    } else {
      const m = parseMoney(text);
      if (!m.valid) out.push('Bill discount must be an amount like 50 or 50.25');
      else if (m.paise > billBase(pos)) out.push('Bill discount is more than the bill');
    }
  }
  return out;
}

export function buildInvoicePayload(pos) {
  return {
    items: pos.lines.map((l) => ({
      productId: l.productId,
      qty: Number(l.qtyText),
      // Only send a price when the user really overrides it. A stale price would be rejected for cashiers.
      ...(l.priceText !== '' && { unitPricePaise: parseMoney(l.priceText).paise }),
      discountPaise: parseMoney(l.discountText).paise,
    })),
    billDiscountPaise: billDiscountPaise(pos),
    ...(pos.customer?._id && { customerId: pos.customer._id }),
    ...(pos.placeOfSupply && { placeOfSupplyStateCode: pos.placeOfSupply }),
    ...(pos.notes.trim() && { notes: pos.notes.trim() }),
  };
}

// One payment: the server fills in the full amount. Several: every amount must be given.
export function buildPayments(pos) {
  const ref = (p) => (p.reference.trim() ? { reference: p.reference.trim() } : {});
  if (pos.payments.length === 1) return [{ mode: pos.payments[0].mode, ...ref(pos.payments[0]) }];
  return pos.payments.map((p) => ({ mode: p.mode, amountPaise: parseMoney(p.amount).paise, ...ref(p) }));
}

export function paymentIssues(pos, totalPaise) {
  const out = [];
  if (totalPaise === null || totalPaise === undefined) return out;
  if (pos.payments.some((p) => p.mode === 'CREDIT') && !pos.customer?._id) {
    out.push('Choose a saved customer for a credit sale');
  }
  if (pos.payments.length > 1) {
    let sum = 0;
    for (const p of pos.payments) {
      const m = parseMoney(p.amount);
      if (!m.valid || m.empty || m.paise < 1) return [...out, 'Enter an amount for every payment'];
      sum += m.paise;
    }
    if (sum !== totalPaise) {
      out.push(`Payments are ${sum < totalPaise ? 'short' : 'over'} by ${formatMoney(Math.abs(totalPaise - sum))}`);
    }
  }
  return out;
}