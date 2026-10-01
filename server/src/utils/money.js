// All amounts are integer paise. Never use floats for money.

// round(a * b / d), half-up, for non-negative integers.
// BigInt: qty (thousandths) x price (paise) can exceed 2^53.
export function mulDiv(a, b, d) {
  if (!(Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(d) && a >= 0 && b >= 0 && d > 0)) {
    throw new RangeError('mulDiv expects non-negative integers and a positive divisor');
  }
  const result = (2n * BigInt(a) * BigInt(b) + BigInt(d)) / (2n * BigInt(d)); // floor((2ab + d) / 2d)
  const n = Number(result);
  if (!Number.isSafeInteger(n)) throw new RangeError('Amount too large');
  return n;
}

// Nearest rupee, half-up (10050 paise -> 10100).
export const roundToRupee = (paise) => Math.floor((paise + 50) / 100) * 100;

// Splits `total` across `weights` so the parts sum EXACTLY to total (largest-remainder method).
// Callers must ensure total <= sum(weights); then no part can exceed its weight.
export function allocateProRata(total, weights) {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sumW === 0) return weights.map(() => 0);

  const T = BigInt(total);
  const S = BigInt(sumW);
  const parts = weights.map((w, index) => {
    const product = T * BigInt(w);
    return { index, base: Number(product / S), frac: product % S };
  });

  let remainder = total - parts.reduce((a, p) => a + p.base, 0);
  const result = parts.map((p) => p.base);
  const byFraction = [...parts].sort((a, b) =>
    a.frac === b.frac ? a.index - b.index : a.frac > b.frac ? -1 : 1
  );
  for (const p of byFraction) {
    if (remainder === 0) break;
    result[p.index] += 1;
    remainder -= 1;
  }
  return result;
}

// ₹1,23,456.78 (Indian digit grouping)
export const formatINR = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);