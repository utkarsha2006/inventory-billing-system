import { ApiError } from './ApiError.js';
import { allocateProRata, mulDiv, roundToRupee } from './money.js';

export const SUPPLY_TYPES = Object.freeze({ INTRA: 'INTRA', INTER: 'INTER' });

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

export function resolvePlaceOfSupply({ shopStateCode, explicitStateCode, customerGstin, customerStateCode }) {
  return (
    explicitStateCode ||
    (customerGstin && customerGstin.slice(0, 2)) ||
    customerStateCode ||
    shopStateCode
  );
}

export const resolveSupplyType = (shopStateCode, placeOfSupply) =>
  shopStateCode === placeOfSupply ? SUPPLY_TYPES.INTRA : SUPPLY_TYPES.INTER;

// Line amount as entered: qty (thousandths) x unit price, rounded to paise.
export const lineGross = (qtyMilli, unitPricePaise) => mulDiv(qtyMilli, unitPricePaise, 1000);

// `netPaise` is the line value after ALL discounts, in the same terms the price was entered
// (tax-inclusive or tax-exclusive).
export function taxOnNet({ netPaise, gstRate, inclusive }) {
  if (gstRate === 0) return { taxablePaise: netPaise, taxPaise: 0 };
  if (inclusive) {
    const taxablePaise = mulDiv(netPaise, 100, 100 + gstRate);
    return { taxablePaise, taxPaise: netPaise - taxablePaise }; // tax = remainder, so total == entered price
  }
  return { taxablePaise: netPaise, taxPaise: mulDiv(netPaise, gstRate, 100) };
}

// CGST and SGST never differ by more than 1 paisa; SGST takes the odd paisa.
export function splitTax(taxPaise, supplyType) {
  if (supplyType === SUPPLY_TYPES.INTER) return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
  const cgstPaise = Math.floor(taxPaise / 2);
  return { cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0 };
}

/**
 * lines: [{ qtyMilli, unitPricePaise, priceIncludesGst, discountPaise, gstRate, hsnCode }]
 * Pure function: everything is integers, nothing touches the database.
 */
export function computeInvoiceAmounts({ lines, billDiscountPaise = 0, supplyType }) {
  const gross = lines.map((l, i) => {
    const g = lineGross(l.qtyMilli, l.unitPricePaise);
    if (l.discountPaise > g) throw ApiError.badRequest(`Item ${i + 1}: discount exceeds the line amount`);
    return g;
  });
  const net = lines.map((l, i) => gross[i] - l.discountPaise);

  if (billDiscountPaise > sum(net)) throw ApiError.badRequest('Bill discount exceeds the bill amount');
  const shares = allocateProRata(billDiscountPaise, net);

  const out = lines.map((l, i) => {
    const netPaise = net[i] - shares[i];
    const { taxablePaise, taxPaise } = taxOnNet({ netPaise, gstRate: l.gstRate, inclusive: l.priceIncludesGst });
    return {
      grossPaise: gross[i],
      discountPaise: l.discountPaise,
      billDiscountSharePaise: shares[i],
      taxablePaise,
      gstRate: l.gstRate,
      taxPaise,
      ...splitTax(taxPaise, supplyType),
      lineTotalPaise: l.priceIncludesGst ? netPaise : netPaise + taxPaise,
    };
  });

  // Tax breakup per HSN + rate (the PDF's tax table and the GSTR-1 HSN summary).
  const groups = new Map();
  out.forEach((o, i) => {
    const hsnCode = lines[i].hsnCode ?? '';
    const key = `${hsnCode}|${o.gstRate}`;
    const g = groups.get(key) ?? { hsnCode, gstRate: o.gstRate, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    g.taxablePaise += o.taxablePaise;
    g.cgstPaise += o.cgstPaise;
    g.sgstPaise += o.sgstPaise;
    g.igstPaise += o.igstPaise;
    groups.set(key, g);
  });
  const taxSummary = [...groups.values()].sort(
    (a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.gstRate - b.gstRate
  );

  const rawTotal = sum(out.map((o) => o.lineTotalPaise));
  const roundOffPaise = roundToRupee(rawTotal) - rawTotal;

  const totals = {
    subtotalPaise: sum(out.map((o) => o.grossPaise)),
    itemDiscountPaise: sum(out.map((o) => o.discountPaise)),
    billDiscountPaise,
    taxablePaise: sum(out.map((o) => o.taxablePaise)),
    cgstPaise: sum(out.map((o) => o.cgstPaise)),
    sgstPaise: sum(out.map((o) => o.sgstPaise)),
    igstPaise: sum(out.map((o) => o.igstPaise)),
    roundOffPaise,
    grandTotalPaise: rawTotal + roundOffPaise,
  };
  if (!Number.isSafeInteger(totals.grandTotalPaise)) throw ApiError.badRequest('Invoice amount is too large');

  return { lines: out, totals, taxSummary };
}