// Indian financial year: 1 April to 31 March, evaluated in IST (UTC+5:30), whatever the server's timezone.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istParts(date) {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function financialYearOf(date = new Date()) {
  const { year, month } = istParts(date);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`; // "2025-26"
}

export function istYmd(date = new Date()) {
  const { year, month, day } = istParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const formatInvoiceNo = (prefix, financialYear, seq) =>
  `${prefix}/${financialYear}/${String(seq).padStart(4, '0')}`; // INV/2025-26/0001

// Last moment (IST) up to which a credit note can still reduce output tax for an invoice of
// financial year "2025-26": 30 November 2026 (CGST Act, Section 34(2)).
export function section34Cutoff(financialYear) {
  const endYear = Number(financialYear.slice(0, 4)) + 1;
  return new Date(`${endYear}-11-30T23:59:59.999+05:30`);
}