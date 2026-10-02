export function financialYearOf() {}

export function formatInvoiceNo() {}

export function istYmd() {}

//Phase 6
// Last moment (IST) up to which a credit note can still reduce output tax for an invoice of
// financial year "2025-26": 30 November 2026 (CGST Act, Section 34(2)).
export function section34Cutoff(financialYear) {
  const endYear = Number(financialYear.slice(0, 4)) + 1;
  return new Date(`${endYear}-11-30T23:59:59.999+05:30`);
}