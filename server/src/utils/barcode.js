// Scanners differ: some emit UPC-A (12 digits), others the same code as EAN-13 with a leading 0.
// Store and look up everything in the 13-digit form so both find the same product.
// Indian retail codes are already EAN-13 (prefix 890), so they pass through unchanged.
export function normalizeBarcode(code) {
  const c = String(code).trim();
  return /^\d{12}$/.test(c) ? `0${c}` : c;
}