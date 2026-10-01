const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 2-digit state + 10-char PAN + entity number + 'Z' + checksum
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Standard GSTIN check-digit algorithm (base-36, alternating weights 1 and 2).
export function gstinChecksum(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = CHARS.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function isValidGstin(gstin) {
  if (typeof gstin !== 'string' || !GSTIN_REGEX.test(gstin)) return false;
  return gstinChecksum(gstin.slice(0, 14)) === gstin[14];
}

// Shared by the register validator and the shop-update service.
export function gstProfileIssues({ gstin, gstRegistrationType, stateCode }) {
  const issues = [];
  const registered = gstRegistrationType !== 'UNREGISTERED';

  if (registered && !gstin) {
    issues.push({ path: 'gstin', message: 'GSTIN is required for a GST-registered shop' });
  }
  if (!registered && gstin) {
    issues.push({ path: 'gstin', message: 'An unregistered shop cannot have a GSTIN' });
  }
  if (gstin) {
    if (!isValidGstin(gstin)) {
      issues.push({ path: 'gstin', message: 'Invalid GSTIN (format or check digit)' });
    } else if (stateCode && gstin.slice(0, 2) !== stateCode) {
      issues.push({ path: 'gstin', message: 'GSTIN state code does not match the shop state' });
    }
  }
  return issues;
}