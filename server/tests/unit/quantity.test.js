import { toMilli, fromMilli, hasMaxThreeDecimals, qtyProblem } from '../../src/utils/quantity.js';
import { normalizeBarcode } from '../../src/utils/barcode.js';

describe('quantity utils', () => {
  test('toMilli is float-safe', () => {
    expect(toMilli(0.1 + 0.2)).toBe(300);
    expect(toMilli(1.005)).toBe(1005);
    expect(toMilli(2)).toBe(2000);
  });

  test('fromMilli converts back', () => {
    expect(fromMilli(1234)).toBe(1.234);
  });

  test('rejects more than 3 decimals', () => {
    expect(hasMaxThreeDecimals(1.0005)).toBe(false);
    expect(hasMaxThreeDecimals(0.3)).toBe(true);
  });

  test('whole units reject fractions; KG/L/M allow them', () => {
    expect(qtyProblem('PCS', 1.5)).toMatch(/whole number/);
    expect(qtyProblem('KG', 1.5)).toBeNull();
    expect(qtyProblem('KG', 0.0001)).toMatch(/3 decimal/);
  });
});

describe('barcode normalization', () => {
  test('UPC-A (12 digits) becomes EAN-13', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
  });
  test('EAN-13, Code128 and whitespace are handled', () => {
    expect(normalizeBarcode('8901058000290')).toBe('8901058000290');
    expect(normalizeBarcode('  AB-123 ')).toBe('AB-123');
  });
});