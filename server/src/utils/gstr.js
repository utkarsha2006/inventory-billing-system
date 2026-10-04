// Inter-state B2C invoices ABOVE this value are reported invoice-by-invoice (GSTR-1 Table 5).
// Effective from the August 2024 tax period (was ₹2.5 lakh).
export const B2CL_THRESHOLD_PAISE = 10_000_000; // ₹1,00,000

// Our units -> GST Unit Quantity Codes.
const UQC = { PCS: 'PCS', KG: 'KGS', G: 'GMS', L: 'LTR', ML: 'MLT', M: 'MTR', BOX: 'BOX', PACK: 'PAC' };
export const uqcOf = (unit) => UQC[unit] ?? 'OTH';

export const classifyB2C = ({ supplyType, grandTotalPaise }) =>
  supplyType === 'INTER' && grandTotalPaise > B2CL_THRESHOLD_PAISE ? 'B2CL' : 'B2CS';

/**
 * GST set-off order. liability and itc are { igst, cgst, sgst } in paise, all >= 0.
 *   IGST credit : IGST first, then CGST, then SGST
 *   CGST credit : CGST first, then IGST   (never SGST)
 *   SGST credit : SGST first, then IGST   (never CGST)
 */
export function computeSetOff(liability, itc) {
  const remainingTax = { ...liability };
  const remainingCredit = { ...itc };
  const utilised = {
    igst: { igst: 0, cgst: 0, sgst: 0 },
    cgst: { igst: 0, cgst: 0, sgst: 0 },
    sgst: { igst: 0, cgst: 0, sgst: 0 },
  };

  const pay = (creditHead, taxHead) => {
    const amount = Math.min(remainingCredit[creditHead], remainingTax[taxHead]);
    remainingCredit[creditHead] -= amount;
    remainingTax[taxHead] -= amount;
    utilised[creditHead][taxHead] += amount;
  };

  pay('igst', 'igst');
  pay('igst', 'cgst');
  pay('igst', 'sgst');
  pay('cgst', 'cgst');
  pay('cgst', 'igst');
  pay('sgst', 'sgst');
  pay('sgst', 'igst');

  return { cashPayable: remainingTax, creditCarriedForward: remainingCredit, utilised };
}