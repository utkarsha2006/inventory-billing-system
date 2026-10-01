import { mulDiv, roundToRupee, allocateProRata, formatINR } from '../../src/utils/money.js';

describe('mulDiv', () => {
  test('rounds half-up', () => {
    expect(mulDiv(1, 1, 2)).toBe(1); // 0.5 -> 1
    expect(mulDiv(5, 1, 2)).toBe(3); // 2.5 -> 3
    expect(mulDiv(1, 1, 3)).toBe(0);
    expect(mulDiv(2, 1, 3)).toBe(1);
  });

  test('is exact beyond 2^53 intermediates', () => {
    // 9,999,999,000 (milli-qty) x 1,000,000,000 (paise) = ~1e19 would overflow a double
    expect(mulDiv(9_999_999_000, 1_000_000_000, 1_000_000_000_000)).toBe(9_999_999);
  });

  test('throws when the result is not a safe integer', () => {
    expect(() => mulDiv(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });
});

describe('roundToRupee', () => {
  test('nearest rupee, half-up', () => {
    expect(roundToRupee(10049)).toBe(10000);
    expect(roundToRupee(10050)).toBe(10100);
    expect(roundToRupee(10000)).toBe(10000);
    expect(roundToRupee(1103)).toBe(1100);
  });
});

describe('allocateProRata', () => {
  test('parts sum exactly to the total (largest remainder)', () => {
    const parts = allocateProRata(100, [1, 1, 1]);
    expect(parts).toEqual([34, 33, 33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  test('proportional when divisible', () => {
    expect(allocateProRata(3000, [10000, 20000])).toEqual([1000, 2000]);
    expect(allocateProRata(4, [10, 0, 30])).toEqual([1, 0, 3]);
  });

  test('zero total or zero weights allocate nothing', () => {
    expect(allocateProRata(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProRata(5, [0, 0])).toEqual([0, 0]);
  });
});

test('formatINR uses Indian digit grouping', () => {
  expect(formatINR(12345678)).toBe('₹1,23,456.78');
});