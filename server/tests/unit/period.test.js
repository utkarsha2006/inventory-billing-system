import { resolvePeriod, periodRange, eachDay, eachMonth, addDays } from '../../src/utils/period.js';

describe('resolvePeriod', () => {
  const now = new Date('2026-10-02T05:00:00Z'); // 10:30 IST

  test('defaults to month-to-date in IST', () => {
    expect(resolvePeriod({}, now)).toEqual({ from: '2026-10-01', to: '2026-10-02' });
  });

  test('a lone `to` starts at the first of its month', () => {
    expect(resolvePeriod({ to: '2026-03-15' }, now)).toEqual({ from: '2026-03-01', to: '2026-03-15' });
  });

  test('uses the IST date even when UTC is still the previous day', () => {
    expect(resolvePeriod({}, new Date('2026-03-31T20:00:00Z'))).toEqual({ from: '2026-04-01', to: '2026-04-01' });
  });

  test('rejects reversed and oversized ranges', () => {
    expect(() => resolvePeriod({ from: '2026-10-05', to: '2026-10-01' }, now)).toThrow(/must not be after/);
    expect(() => resolvePeriod({ from: '2024-01-01', to: '2024-12-31' }, now)).not.toThrow(); // 366 days: a leap year
    expect(() => resolvePeriod({ from: '2024-01-01', to: '2025-01-01' }, now)).toThrow(/366/);
  });
});

test('periodRange covers 00:00 IST to 23:59:59.999 IST', () => {
  const { start, end } = periodRange({ from: '2026-10-01', to: '2026-10-01' });
  expect(start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
  expect(end.toISOString()).toBe('2026-10-01T18:29:59.999Z');
});

test('eachDay, eachMonth and addDays', () => {
  expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  expect(eachMonth('2026-11-15', '2027-01-02')).toEqual(['2026-11', '2026-12', '2027-01']);
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
});