import {
  computeInvoiceAmounts,
  resolvePlaceOfSupply,
  resolveSupplyType,
  splitTax,
} from '../../src/utils/gst.js';

const line = (o = {}) => ({
  qtyMilli: 1000,
  unitPricePaise: 10000,
  priceIncludesGst: false,
  discountPaise: 0,
  gstRate: 18,
  hsnCode: '1905',
  ...o,
});

const calc = (lines, o = {}) =>
  computeInvoiceAmounts({ lines, billDiscountPaise: 0, supplyType: 'INTRA', ...o });

describe('exclusive pricing', () => {
  test('18% intra-state splits into equal CGST and SGST', () => {
    const { lines, totals } = calc([line()]);
    expect(lines[0]).toMatchObject({ taxablePaise: 10000, cgstPaise: 900, sgstPaise: 900, igstPaise: 0, lineTotalPaise: 11800 });
    expect(totals.grandTotalPaise).toBe(11800);
  });

  test('inter-state puts all tax in IGST', () => {
    const { lines, totals } = calc([line()], { supplyType: 'INTER' });
    expect(lines[0]).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 1800 });
    expect(totals.igstPaise).toBe(1800);
  });

  test('odd tax paise: SGST takes the extra paisa, then the bill rounds to the rupee', () => {
    const { lines, totals } = calc([line({ unitPricePaise: 1050, gstRate: 5 })]);
    expect(lines[0]).toMatchObject({ taxPaise: 53, cgstPaise: 26, sgstPaise: 27, lineTotalPaise: 1103 });
    expect(totals).toMatchObject({ roundOffPaise: -3, grandTotalPaise: 1100 });
  });

  test('0% rate produces no tax', () => {
    const { lines } = calc([line({ gstRate: 0 })]);
    expect(lines[0]).toMatchObject({ taxPaise: 0, cgstPaise: 0, sgstPaise: 0, lineTotalPaise: 10000 });
  });
});

describe('inclusive pricing', () => {
  test('tax is backed out of the entered price', () => {
    const { lines } = calc([line({ unitPricePaise: 11800, priceIncludesGst: true })]);
    expect(lines[0]).toMatchObject({ taxablePaise: 10000, taxPaise: 1800, lineTotalPaise: 11800 });
  });

  test('rounding: tax is the remainder so the total equals the entered price', () => {
    const { lines } = calc([line({ unitPricePaise: 9900, priceIncludesGst: true, gstRate: 5 })]);
    expect(lines[0]).toMatchObject({ taxablePaise: 9429, taxPaise: 471, cgstPaise: 235, sgstPaise: 236, lineTotalPaise: 9900 });
  });
});

describe('discounts', () => {
  test('item discount reduces the taxable value', () => {
    const { lines } = calc([line({ unitPricePaise: 20000, discountPaise: 5000 })]);
    expect(lines[0]).toMatchObject({ taxablePaise: 15000, taxPaise: 2700, lineTotalPaise: 17700 });
  });

  test('bill discount is shared pro-rata before tax', () => {
    const { lines, totals } = calc(
      [line({ unitPricePaise: 10000, gstRate: 5 }), line({ unitPricePaise: 20000, gstRate: 18 })],
      { billDiscountPaise: 3000 }
    );
    expect(lines.map((l) => l.billDiscountSharePaise)).toEqual([1000, 2000]);
    expect(lines.map((l) => l.taxablePaise)).toEqual([9000, 18000]);
    expect(lines.map((l) => l.taxPaise)).toEqual([450, 3240]);
    expect(totals).toMatchObject({
      taxablePaise: 27000,
      cgstPaise: 1845,
      sgstPaise: 1845,
      roundOffPaise: 10,
      grandTotalPaise: 30700,
      billDiscountPaise: 3000,
    });
  });

  test('rejects discounts larger than the amount', () => {
    expect(() => calc([line({ discountPaise: 10001 })])).toThrow(/discount/i);
    expect(() => calc([line()], { billDiscountPaise: 10001 })).toThrow(/discount/i);
  });
});

describe('quantities', () => {
  test('fractional quantity: 250 g at ₹80/kg', () => {
    const { lines } = calc([line({ qtyMilli: 250, unitPricePaise: 8000, gstRate: 0 })]);
    expect(lines[0].grossPaise).toBe(2000);
  });

  test('line amount rounds half-up to the paisa', () => {
    const { lines } = calc([line({ qtyMilli: 1500, unitPricePaise: 3333, gstRate: 0 })]);
    expect(lines[0].grossPaise).toBe(5000); // 4999.5
  });
});

describe('tax summary', () => {
  test('groups lines by HSN and rate', () => {
    const { taxSummary } = calc([
      line({ hsnCode: '1905' }),
      line({ hsnCode: '1905' }),
      line({ hsnCode: '1905', gstRate: 5 }),
      line({ hsnCode: '3304' }),
    ]);
    expect(taxSummary).toHaveLength(3);
    expect(taxSummary[0]).toMatchObject({ hsnCode: '1905', gstRate: 5, taxablePaise: 10000 });
    expect(taxSummary[1]).toMatchObject({ hsnCode: '1905', gstRate: 18, taxablePaise: 20000, cgstPaise: 1800 });
  });
});

describe('place of supply', () => {
  test('explicit value wins, then customer GSTIN state, then customer state, then shop state', () => {
    const base = { shopStateCode: '27' };
    expect(resolvePlaceOfSupply({ ...base })).toBe('27');
    expect(resolvePlaceOfSupply({ ...base, customerStateCode: '24' })).toBe('24');
    expect(resolvePlaceOfSupply({ ...base, customerStateCode: '24', customerGstin: '29ABCDE1234F1ZX' })).toBe('29');
    expect(resolvePlaceOfSupply({ ...base, customerGstin: '29ABCDE1234F1ZX', explicitStateCode: '07' })).toBe('07');
  });

  test('same state is INTRA, otherwise INTER', () => {
    expect(resolveSupplyType('27', '27')).toBe('INTRA');
    expect(resolveSupplyType('27', '29')).toBe('INTER');
  });

  test('splitTax never lets CGST and SGST differ by more than one paisa', () => {
    expect(splitTax(7, 'INTRA')).toEqual({ cgstPaise: 3, sgstPaise: 4, igstPaise: 0 });
    expect(splitTax(8, 'INTRA')).toEqual({ cgstPaise: 4, sgstPaise: 4, igstPaise: 0 });
  });
});

describe('invariants on randomized carts', () => {
  test('every total reconciles exactly', () => {
    let seed = 12345;
    const rnd = (n) => {
      seed = (seed * 48271) % 2147483647; // Park-Miller: deterministic, stays below 2^53
      return seed % n;
    };
    const RATES = [0, 3, 5, 18, 40];

    for (let iter = 0; iter < 500; iter += 1) {
      const lines = Array.from({ length: 1 + rnd(5) }, () =>
        line({
          qtyMilli: 1 + rnd(9999),
          unitPricePaise: 1 + rnd(500000),
          priceIncludesGst: rnd(2) === 1,
          gstRate: RATES[rnd(5)],
        })
      );
      const probe = calc(lines);
      const billDiscountPaise = rnd(Math.floor(probe.totals.subtotalPaise / 2) + 1);
      const { lines: out, totals } = calc(lines, { billDiscountPaise });

      const rawTotal = out.reduce((a, l) => a + l.lineTotalPaise, 0);
      expect(totals.grandTotalPaise).toBe(rawTotal + totals.roundOffPaise);
      expect(totals.grandTotalPaise % 100).toBe(0);
      expect(Math.abs(totals.roundOffPaise)).toBeLessThanOrEqual(50);
      expect(out.reduce((a, l) => a + l.billDiscountSharePaise, 0)).toBe(billDiscountPaise);

      out.forEach((l, i) => {
        const net = l.grossPaise - l.discountPaise - l.billDiscountSharePaise;
        expect(l.cgstPaise + l.sgstPaise + l.igstPaise).toBe(l.taxPaise);
        expect(l.sgstPaise - l.cgstPaise).toBeGreaterThanOrEqual(0);
        expect(l.sgstPaise - l.cgstPaise).toBeLessThanOrEqual(1);
        expect(l.lineTotalPaise).toBe(lines[i].priceIncludesGst ? net : l.taxablePaise + l.taxPaise);
      });
    }
  });
});