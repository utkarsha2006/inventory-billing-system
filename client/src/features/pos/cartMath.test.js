import { describe, expect, test } from 'vitest';
import { billDiscountPaise, buildInvoicePayload, buildPayments, cartIssues, grossFloor, parseQty, paymentIssues } from './cartMath.js';
import { paiseToInput, parseMoney } from '../../utils/format.js';

const line = (o = {}) => ({ productId: 'p1', name: 'Rice', sku: 'R1', unit: 'PCS', pricePaise: 10000, stockQty: 50, qtyText: '2', priceText: '', discountText: '', ...o });
const pos = (o = {}) => ({
  lines: [line()],
  customer: null,
  billDiscount: { mode: 'amount', value: '' },
  placeOfSupply: '',
  payments: [{ mode: 'CASH', amount: '', reference: '' }],
  notes: '',
  requestId: 'req-1',
  ...o,
});

describe('parseMoney', () => {
  test('parses rupees to exact paise without floats', () => {
    expect(parseMoney('99.5').paise).toBe(9950);
    expect(parseMoney('0.07').paise).toBe(7);
    expect(parseMoney('1234').paise).toBe(123400);
    expect(parseMoney('19.99').paise).toBe(1999); // 19.99 * 100 === 1998.9999999999998 in floats
  });
  test('rejects bad input and treats blank as zero', () => {
    for (const bad of ['1,000', '12.345', '-5', 'abc', '1.']) expect(parseMoney(bad).valid).toBe(false);
    expect(parseMoney('')).toMatchObject({ paise: 0, valid: true, empty: true });
  });
  test('paiseToInput round-trips', () => {
    expect(paiseToInput(9950)).toBe('99.50');
    expect(parseMoney(paiseToInput(1999)).paise).toBe(1999);
  });
});

describe('parseQty', () => {
  test('whole units reject fractions; KG allows up to 3 decimals', () => {
    expect(parseQty('PCS', '1.5').error).toMatch(/Whole numbers/);
    expect(parseQty('KG', '1.5').qty).toBe(1.5);
    expect(parseQty('KG', '0.0005').error).toBeDefined();
    expect(parseQty('PCS', '0').error).toBeDefined();
    expect(parseQty('PCS', '').error).toBeDefined();
  });
});

describe('discounts', () => {
  test('grossFloor never exceeds the exact amount', () => {
    expect(grossFloor(1.5, 3333)).toBe(4999); // exact 4999.5; the server rounds up, we round down
  });

  test('percentage discount is computed in integer basis points on the post-line-discount base', () => {
    const p = pos({ lines: [line({ qtyText: '3', discountText: '50' })], billDiscount: { mode: 'percent', value: '10' } });
    expect(billDiscountPaise(p)).toBe(2500); // (3 x 100 - 50) = 250 rupees -> 10% = 25
  });

  test('percent over 100 or malformed counts as an issue', () => {
    expect(cartIssues(pos({ billDiscount: { mode: 'percent', value: '150' } }))).toContain('Bill discount must be between 0 and 100%');
    expect(cartIssues(pos({ billDiscount: { mode: 'amount', value: '9999' } }))).toContain('Bill discount is more than the bill');
  });
});

describe('buildInvoicePayload', () => {
  test('sends a price only when it was overridden', () => {
    const plain = buildInvoicePayload(pos());
    expect(plain.items[0]).toEqual({ productId: 'p1', qty: 2, discountPaise: 0 });
    const over = buildInvoicePayload(pos({ lines: [line({ priceText: '90' })] }));
    expect(over.items[0].unitPricePaise).toBe(9000);
  });

  test('includes customer, place of supply and notes when set', () => {
    const body = buildInvoicePayload(pos({ customer: { _id: 'c1' }, placeOfSupply: '29', notes: ' hi ' }));
    expect(body).toMatchObject({ customerId: 'c1', placeOfSupplyStateCode: '29', notes: 'hi' });
  });
});

describe('payments', () => {
  test('a single payment omits the amount; the server fills in the total', () => {
    expect(buildPayments(pos())).toEqual([{ mode: 'CASH' }]);
  });

  test('split payments must add up to the total', () => {
    const split = pos({ payments: [{ mode: 'CASH', amount: '100', reference: '' }, { mode: 'UPI', amount: '36', reference: 'U1' }] });
    expect(paymentIssues(split, 13600)).toEqual([]);
    expect(buildPayments(split)).toEqual([{ mode: 'CASH', amountPaise: 10000 }, { mode: 'UPI', amountPaise: 3600, reference: 'U1' }]);
    expect(paymentIssues(split, 14000)[0]).toMatch(/short by/);
  });

  test('credit needs a saved customer', () => {
    const credit = pos({ payments: [{ mode: 'CREDIT', amount: '', reference: '' }] });
    expect(paymentIssues(credit, 10000)).toContain('Choose a saved customer for a credit sale');
    expect(paymentIssues({ ...credit, customer: { _id: 'c1' } }, 10000)).toEqual([]);
  });
});