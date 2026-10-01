import { isValidGstin, gstinChecksum, gstProfileIssues } from '../../src/utils/gstin.js';

describe('GSTIN utils', () => {
  test('accepts a valid GSTIN', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
  });

  test('rejects a wrong check digit', () => {
    expect(isValidGstin('27AAPFU0939F1ZX')).toBe(false);
  });

  test('rejects wrong length and lowercase', () => {
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('27aapfu0939f1zv')).toBe(false);
  });

  test('computes the check digit', () => {
    expect(gstinChecksum('27AAPFU0939F1Z')).toBe('V');
  });

  test('flags a GSTIN whose state prefix does not match the shop state', () => {
    const issues = gstProfileIssues({
      gstin: '27AAPFU0939F1ZV',
      gstRegistrationType: 'REGULAR',
      stateCode: '29',
    });
    expect(issues).toHaveLength(1);
  });

  test('requires GSTIN for registered shops and forbids it for unregistered', () => {
    expect(gstProfileIssues({ gstRegistrationType: 'REGULAR', stateCode: '27' })).toHaveLength(1);
    expect(
      gstProfileIssues({ gstin: '27AAPFU0939F1ZV', gstRegistrationType: 'UNREGISTERED', stateCode: '27' })
    ).toHaveLength(1);
  });
});