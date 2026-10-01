import { amountInWords, integerToWords } from '../../src/utils/numberToWords.js';

describe('integerToWords (Indian numbering)', () => {
  test.each([
    [0, 'Zero'],
    [7, 'Seven'],
    [19, 'Nineteen'],
    [40, 'Forty'],
    [99, 'Ninety Nine'],
    [100, 'One Hundred'],
    [118, 'One Hundred Eighteen'],
    [1000, 'One Thousand'],
    [23600, 'Twenty Three Thousand Six Hundred'],
    [100000, 'One Lakh'],
    [123456, 'One Lakh Twenty Three Thousand Four Hundred Fifty Six'],
    [10000000, 'One Crore'],
    [12345678, 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight'],
    [1000000000, 'One Hundred Crore'],
  ])('%i -> %s', (n, words) => {
    expect(integerToWords(n)).toBe(words);
  });
});

describe('amountInWords', () => {
  test('whole rupees', () => {
    expect(amountInWords(11800)).toBe('Rupees One Hundred Eighteen Only');
    expect(amountInWords(100)).toBe('Rupees One Only');
  });

  test('rupees and paise', () => {
    expect(amountInWords(12350)).toBe('Rupees One Hundred Twenty Three and Fifty Paise Only');
  });

  test('paise only and zero', () => {
    expect(amountInWords(5)).toBe('Five Paise Only');
    expect(amountInWords(0)).toBe('Rupees Zero Only');
  });

  test('rejects negatives and non-integers', () => {
    expect(() => amountInWords(-1)).toThrow(RangeError);
    expect(() => amountInWords(10.5)).toThrow(RangeError);
  });
});