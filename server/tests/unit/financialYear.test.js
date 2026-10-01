import { financialYearOf, istYmd, formatInvoiceNo } from '../../src/utils/financialYear.js';

describe('financialYearOf (IST)', () => {
  test('April to December belongs to the year that starts', () => {
    expect(financialYearOf(new Date('2025-04-01T10:00:00Z'))).toBe('2025-26');
    expect(financialYearOf(new Date('2025-12-31T10:00:00Z'))).toBe('2025-26');
  });

  test('January to March belongs to the year that started the previous April', () => {
    expect(financialYearOf(new Date('2026-01-15T10:00:00Z'))).toBe('2025-26');
  });

  test('the boundary follows IST, not UTC', () => {
    expect(financialYearOf(new Date('2026-03-31T18:29:59Z'))).toBe('2025-26'); // 23:59:59 IST, 31 Mar
    expect(financialYearOf(new Date('2026-03-31T18:30:00Z'))).toBe('2026-27'); // 00:00:00 IST, 1 Apr
  });

  test('zero-pads the short year', () => {
    expect(financialYearOf(new Date('2009-06-01T00:00:00Z'))).toBe('2009-10');
  });
});

test('istYmd gives the IST calendar date', () => {
  expect(istYmd(new Date('2026-03-31T20:00:00Z'))).toBe('2026-04-01');
});

test('formatInvoiceNo pads to 4 digits and stays within the 16-character GST limit', () => {
  const no = formatInvoiceNo('INV', '2025-26', 1);
  expect(no).toBe('INV/2025-26/0001');
  expect(no).toHaveLength(16);
});