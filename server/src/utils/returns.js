import { mulDiv, roundToRupee } from './money.js';

const sumOf = (rows, key) => rows.reduce((acc, r) => acc + r[key], 0);

/**
 * Credit amounts for returning `returnMilli` of an invoice item, of which `alreadyMilli` was returned before.
 *
 * Each amount is the difference of two cumulative shares, share(already + now) - share(already),
 * so the pieces of any sequence of partial returns add up EXACTLY to the original line, and
 * returning everything reproduces it to the paisa. Rounding drift can't accumulate.
 */
export function creditLineFor(item, alreadyMilli, returnMilli) {
  const upTo = alreadyMilli + returnMilli;
  const portion = (value = 0) => mulDiv(value, upTo, item.qtyMilli) - mulDiv(value, alreadyMilli, item.qtyMilli);

  const part = {
    grossPaise: portion(item.grossPaise),
    discountPaise: portion(item.discountPaise),
    billDiscountSharePaise: portion(item.billDiscountSharePaise),
    taxablePaise: portion(item.taxablePaise),
    cgstPaise: portion(item.cgstPaise),
    sgstPaise: portion(item.sgstPaise),
    igstPaise: portion(item.igstPaise),
    costPaise: portion(item.costPaise),
  };
  // Every invoice line satisfies lineTotal == taxable + cgst + sgst + igst (inclusive and exclusive).
  return { ...part, lineTotalPaise: part.taxablePaise + part.cgstPaise + part.sgstPaise + part.igstPaise };
}

/**
 * Which batches get the returned goods back. The picks are the batches the sale drew from,
 * in sale order. The first R units sold are the first R units given back, so the allocation
 * is a pure function of (already, now) and needs no extra per-batch counters.
 */
export function allocateAcrossPicks(picks, alreadyMilli, returnMilli) {
  const upTo = alreadyMilli + returnMilli;
  const out = [];
  let before = 0;
  for (const pick of picks) {
    const from = Math.min(Math.max(alreadyMilli - before, 0), pick.qtyMilli);
    const to = Math.min(Math.max(upTo - before, 0), pick.qtyMilli);
    if (to > from) out.push({ batchId: pick.batchId, qtyMilli: to - from });
    before += pick.qtyMilli;
  }
  return out;
}

// Totals (rounded to the rupee, like invoices) and the HSN-wise tax breakup of a credit note.
export function summarizeCredit(lines) {
  const rawTotal = sumOf(lines, 'lineTotalPaise');
  const roundOffPaise = roundToRupee(rawTotal) - rawTotal;

  const totals = {
    subtotalPaise: sumOf(lines, 'grossPaise'),
    itemDiscountPaise: sumOf(lines, 'discountPaise'),
    billDiscountPaise: sumOf(lines, 'billDiscountSharePaise'),
    taxablePaise: sumOf(lines, 'taxablePaise'),
    cgstPaise: sumOf(lines, 'cgstPaise'),
    sgstPaise: sumOf(lines, 'sgstPaise'),
    igstPaise: sumOf(lines, 'igstPaise'),
    roundOffPaise,
    grandTotalPaise: rawTotal + roundOffPaise,
  };

  const groups = new Map();
  for (const l of lines) {
    const hsnCode = l.hsnCode ?? '';
    const key = `${hsnCode}|${l.gstRate}`;
    const g = groups.get(key) ?? { hsnCode, gstRate: l.gstRate, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    g.taxablePaise += l.taxablePaise;
    g.cgstPaise += l.cgstPaise;
    g.sgstPaise += l.sgstPaise;
    g.igstPaise += l.igstPaise;
    groups.set(key, g);
  }
  const taxSummary = [...groups.values()].sort((a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.gstRate - b.gstRate);

  return { totals, taxSummary };
}