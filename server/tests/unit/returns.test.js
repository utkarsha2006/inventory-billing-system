import { creditLineFor, allocateAcrossPicks, summarizeCredit } from '../../src/utils/returns.js';
import { weightedAverage } from '../../src/utils/money.js';
import { section34Cutoff } from '../../src/utils/financialYear.js';

// 3 units, inclusive price: tax 471 paise -> CGST 235, SGST 236 (the odd paisa)
const item = {
  qtyMilli: 3000,
  grossPaise: 9900,
  discountPaise: 0,
  billDiscountSharePaise: 0,
  taxablePaise: 9429,
  cgstPaise: 235,
  sgstPaise: 236,
  igstPaise: 0,
  costPaise: 3000,
};

describe('creditLineFor', () => {
  test('returning one of three units', () => {
    expect(creditLineFor(item, 0, 1000)).toMatchObject({
      grossPaise: 3300,
      taxablePaise: 3143,
      cgstPaise: 78,
      sgstPaise: 79,
      costPaise: 1000,
      lineTotalPaise: 3300,
    });
  });

  test('the remaining two units complete the original exactly', () => {
    expect(creditLineFor(item, 1000, 2000)).toMatchObject({
      grossPaise: 6600,
      taxablePaise: 6286,
      cgstPaise: 157,
      sgstPaise: 157,
      costPaise: 2000,
      lineTotalPaise: 6600,
    });
  });

  test('a full return in one go reproduces the line to the paisa', () => {
    expect(creditLineFor(item, 0, 3000)).toMatchObject({ taxablePaise: 9429, cgstPaise: 235, sgstPaise: 236, lineTotalPaise: 9900 });
  });

  test('any sequence of partial returns sums exactly to the original (randomized)', () => {
    let seed = 987654321;
    const rnd = (n) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    const fields = ['grossPaise', 'discountPaise', 'billDiscountSharePaise', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'costPaise'];

    for (let iter = 0; iter < 300; iter += 1) {
      const qtyMilli = 1000 + rnd(9000);
      const taxablePaise = 1 + rnd(2_000_000);
      const tax = rnd(400_000);
      const it = {
        qtyMilli,
        grossPaise: taxablePaise + tax,
        discountPaise: rnd(500),
        billDiscountSharePaise: rnd(500),
        taxablePaise,
        cgstPaise: Math.floor(tax / 2),
        sgstPaise: tax - Math.floor(tax / 2),
        igstPaise: 0,
        costPaise: rnd(1_000_000),
      };

      const sums = Object.fromEntries(fields.map((f) => [f, 0]));
      let already = 0;
      while (already < qtyMilli) {
        const take = Math.min(1 + rnd(qtyMilli), qtyMilli - already);
        const line = creditLineFor(it, already, take);
        fields.forEach((f) => {
          expect(line[f]).toBeGreaterThanOrEqual(0);
          sums[f] += line[f];
        });
        already += take;
      }
      fields.forEach((f) => expect(sums[f]).toBe(it[f]));
    }
  });
});

describe('allocateAcrossPicks', () => {
  const picks = [
    { batchId: 'a', qtyMilli: 2000 },
    { batchId: 'b', qtyMilli: 3000 },
  ];

  test('returns go back to batches in sale order', () => {
    expect(allocateAcrossPicks(picks, 0, 1000)).toEqual([{ batchId: 'a', qtyMilli: 1000 }]);
    expect(allocateAcrossPicks(picks, 1000, 3000)).toEqual([
      { batchId: 'a', qtyMilli: 1000 },
      { batchId: 'b', qtyMilli: 2000 },
    ]);
    expect(allocateAcrossPicks(picks, 4000, 1000)).toEqual([{ batchId: 'b', qtyMilli: 1000 }]);
  });

  test('the pieces always add up to what was returned', () => {
    const pieces = allocateAcrossPicks(picks, 500, 4000);
    expect(pieces.reduce((a, p) => a + p.qtyMilli, 0)).toBe(4000);
  });
});

describe('summarizeCredit', () => {
  const line = (o) => ({ hsnCode: '1905', gstRate: 5, grossPaise: 0, discountPaise: 0, billDiscountSharePaise: 0, igstPaise: 0, ...o });

  test('rounds to the rupee and records the round-off', () => {
    const { totals } = summarizeCredit([line({ taxablePaise: 1050, cgstPaise: 26, sgstPaise: 27, lineTotalPaise: 1103 })]);
    expect(totals).toMatchObject({ roundOffPaise: -3, grandTotalPaise: 1100, taxablePaise: 1050 });
  });

  test('groups the tax breakup by HSN and rate', () => {
    const { taxSummary } = summarizeCredit([
      line({ taxablePaise: 1000, cgstPaise: 25, sgstPaise: 25, lineTotalPaise: 1050 }),
      line({ taxablePaise: 2000, cgstPaise: 50, sgstPaise: 50, lineTotalPaise: 2100 }),
      line({ hsnCode: '3304', gstRate: 18, taxablePaise: 1000, cgstPaise: 90, sgstPaise: 90, lineTotalPaise: 1180 }),
    ]);
    expect(taxSummary).toHaveLength(2);
    expect(taxSummary[0]).toMatchObject({ hsnCode: '1905', gstRate: 5, taxablePaise: 3000, cgstPaise: 75, sgstPaise: 75 });
  });
});

describe('weightedAverage', () => {
  test('blends two lots by quantity', () => {
    expect(weightedAverage(10000, 5000, 10000, 7000)).toBe(6000);
    expect(weightedAverage(3000, 1000, 1000, 2000)).toBe(1250);
  });
  test('rounds half-up and handles an empty shelf', () => {
    expect(weightedAverage(10000, 5000, 20000, 6000)).toBe(5667); // 5666.67
    expect(weightedAverage(0, 123, 5000, 7000)).toBe(7000);
    expect(weightedAverage(0, 5, 0, 7)).toBe(7);
  });
  test('stays exact for huge quantities', () => {
    expect(weightedAverage(9_999_999_000, 1_000_000_000, 9_999_999_000, 1_000_000_000)).toBe(1_000_000_000);
  });
});

describe('section34Cutoff', () => {
  test('30 Nov after the financial year ends, end of day IST', () => {
    expect(section34Cutoff('2025-26').toISOString()).toBe('2026-11-30T18:29:59.999Z');
    expect(section34Cutoff('2024-25').toISOString()).toBe('2025-11-30T18:29:59.999Z');
  });
});