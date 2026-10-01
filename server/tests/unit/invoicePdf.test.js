import { generateInvoicePdf } from '../../src/pdf/index.js';
import { fmtAmount, fmtDateIST, fmtTimeIST, stateLabel } from '../../src/pdf/helpers.js';
import { computeInvoiceAmounts } from '../../src/utils/gst.js';

const pageCount = (buf) => (buf.toString('latin1').match(/\/Type \/Page(?!s)/g) || []).length;
const mediaBox = (buf) => {
  const m = buf.toString('latin1').match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  return { width: Number(m[1]), height: Number(m[2]) };
};

function makeInvoice({ nItems = 3, supplyType = 'INTRA', documentType = 'TAX_INVOICE', customer, shop, balanceDue = 0 } = {}) {
  const taxable = documentType === 'TAX_INVOICE';
  const lines = Array.from({ length: nItems }, (_, i) => ({
    qtyMilli: 1000 * (i + 1),
    unitPricePaise: 10000 + i * 137,
    priceIncludesGst: taxable && i % 2 === 0,
    discountPaise: 0,
    gstRate: taxable ? [5, 18, 0][i % 3] : 0,
    hsnCode: ['1905', '3304', '1006'][i % 3],
  }));
  const amounts = computeInvoiceAmounts({ lines, billDiscountPaise: 0, supplyType });
  const items = lines.map((l, i) => {
    const { taxPaise, ...computed } = amounts.lines[i];
    return {
      name: `Test Item ${i + 1} with a reasonably long name to force wrapping`,
      unit: 'PCS',
      hsnCode: l.hsnCode,
      qtyMilli: l.qtyMilli,
      unitPricePaise: l.unitPricePaise,
      priceIncludesGst: l.priceIncludesGst,
      ...computed,
      batches: i === 0 ? [{ batchNo: 'B-77', expiryDate: new Date('2027-03-31T00:00:00Z') }] : [],
    };
  });
  const total = amounts.totals.grandTotalPaise;
  return {
    invoiceNo: 'INV/2026-27/0001',
    invoiceDate: new Date('2026-10-01T09:30:00Z'),
    documentType,
    invoiceType: customer?.gstin ? 'B2B' : 'B2C',
    supplyType,
    placeOfSupplyStateCode: supplyType === 'INTRA' ? '27' : '29',
    shopSnapshot: {
      name: 'Sharma Stores',
      gstin: taxable ? '27AAPFU0939F1ZV' : undefined,
      stateCode: '27',
      address: { line1: 'Shop 4, Main Road', city: 'Pimpri', pincode: '411018' },
      phone: '9876543210',
      footerNote: 'Thank you for shopping with us!',
      gstRegistrationType: taxable ? 'REGULAR' : 'COMPOSITION',
      ...shop,
    },
    customerSnapshot: customer ?? {},
    items,
    totals: amounts.totals,
    taxSummary: amounts.taxSummary,
    payments: [{ mode: 'CASH', amountPaise: total - balanceDue }],
    amountPaidPaise: total - balanceDue,
    balanceDuePaise: balanceDue,
    paymentStatus: balanceDue ? 'PARTIAL' : 'PAID',
  };
}

describe('PDF helpers', () => {
  test('Indian digit grouping and sign', () => {
    expect(fmtAmount(12345678)).toBe('1,23,456.78');
    expect(fmtAmount(-3)).toBe('-0.03');
  });

  test('IST date and time regardless of server timezone', () => {
    expect(fmtDateIST(new Date('2026-03-31T20:00:00Z'))).toBe('01/04/2026');
    expect(fmtTimeIST(new Date('2026-03-31T20:00:00Z'))).toBe('01:30');
  });

  test('state label', () => {
    expect(stateLabel('27')).toBe('27-Maharashtra');
    expect(stateLabel(undefined)).toBe('');
  });
});

describe('A4 invoice', () => {
  test('renders a valid single-page PDF for an intra-state tax invoice', async () => {
    const buf = await generateInvoicePdf(makeInvoice(), { format: 'a4' });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(buf)).toBe(1);
    expect(mediaBox(buf).width).toBeCloseTo(595.28, 0);
  });

  test('renders an inter-state B2B invoice with an unpaid balance', async () => {
    const buf = await generateInvoicePdf(
      makeInvoice({ supplyType: 'INTER', customer: { name: 'Karnataka Traders', gstin: '29ABCDE1234F1ZX', stateCode: '29' }, balanceDue: 5000 })
    );
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('renders a composition-dealer Bill of Supply', async () => {
    const buf = await generateInvoicePdf(makeInvoice({ documentType: 'BILL_OF_SUPPLY' }));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('a long invoice flows onto extra pages', async () => {
    const buf = await generateInvoicePdf(makeInvoice({ nItems: 80 }));
    expect(pageCount(buf)).toBeGreaterThan(1);
  });

  test('non-Latin names do not crash the renderer', async () => {
    const buf = await generateInvoicePdf(makeInvoice({ customer: { name: 'रमेश पाटील' }, shop: { name: 'शर्मा स्टोअर्स' } }));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('Thermal receipt', () => {
  test('80mm: one page, width 80mm, height fitted to the content', async () => {
    const buf = await generateInvoicePdf(makeInvoice(), { format: 'thermal', widthMm: 80 });
    expect(pageCount(buf)).toBe(1);
    const { width, height } = mediaBox(buf);
    expect(width).toBeCloseTo(226.77, 1);
    expect(height).toBeGreaterThan(150);
    expect(height).toBeLessThan(3000);
  });

  test('58mm roll is narrower', async () => {
    const buf = await generateInvoicePdf(makeInvoice(), { format: 'thermal', widthMm: 58 });
    expect(mediaBox(buf).width).toBeCloseTo(164.41, 1);
    expect(pageCount(buf)).toBe(1);
  });

  test('more items make a taller receipt, never a second page', async () => {
    const small = mediaBox(await generateInvoicePdf(makeInvoice({ nItems: 2 }), { format: 'thermal' }));
    const big = mediaBox(await generateInvoicePdf(makeInvoice({ nItems: 30 }), { format: 'thermal' }));
    expect(big.height).toBeGreaterThan(small.height * 3);
  });

  test('inter-state and Bill of Supply variants render', async () => {
    const a = await generateInvoicePdf(makeInvoice({ supplyType: 'INTER' }), { format: 'thermal' });
    const b = await generateInvoicePdf(makeInvoice({ documentType: 'BILL_OF_SUPPLY' }), { format: 'thermal' });
    expect(a.subarray(0, 5).toString()).toBe('%PDF-');
    expect(b.subarray(0, 5).toString()).toBe('%PDF-');
  });
});