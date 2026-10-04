import request from 'supertest';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { startTestApp, stopTestApp, createShop, bearer } from '../helpers/testApp.js';
import { gstinChecksum } from '../../src/utils/gstin.js';
import { istYmd } from '../../src/utils/financialYear.js';
import { addDays } from '../../src/utils/period.js';

let app;
let shop; // REGULAR, Maharashtra (27)
let plain; // UNREGISTERED
let today;
let yesterday;
let n = 0;
const next = () => (n += 1);

const post = (path, token, body) => request(app).post(`/api/v1${path}`).set(bearer(token)).send(body);
const get = (path, token) => request(app).get(`/api/v1${path}`).set(bearer(token));
const report = async (path, token = shop.ownerToken, qs = '') => {
  const res = await get(`${path}?from=${yesterday}&to=${today}${qs}`, token);
  return res.body.data;
};
const sheetOf = (r, key) => r.sheets.find((s) => s.key === key);

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const download = (path, token = shop.ownerToken) => request(app).get(`/api/v1${path}`).set(bearer(token)).buffer(true).parse(binary);

const gstinFor = (state, body) => {
  const base = `${state}${body}`;
  return base + gstinChecksum(base);
};

const mkProduct = async (token, o) => (await post('/products', token, { unit: 'PCS', ...o })).body.data;
const sell = (token, items, o = {}) =>
  post('/invoices', token, { clientRequestId: randomUUID(), items, payments: [{ mode: 'CASH' }], ...o });

const buyerGstin = gstinFor('29', 'ABCDE1234F1Z');
let A; // Biscuits: ₹100 + 18%, cost ₹50
let B; // Rice: ₹210 incl. 5%, cost ₹100
let C0; // Milk: ₹50, 0% GST, cost ₹20

beforeAll(async () => {
  app = await startTestApp();
  today = istYmd();
  yesterday = addDays(today, -1);

  shop = await createShop(app, { gstRegistrationType: 'REGULAR', gstin: '27AAPFU0939F1ZV' });
  plain = await createShop(app);

  A = await mkProduct(shop.ownerToken, { name: 'Biscuits', sku: 'BIS', hsnCode: '1905', purchasePricePaise: 5000, sellingPricePaise: 10000, priceIncludesGst: false, gstRate: 18, openingStock: 100 });
  B = await mkProduct(shop.ownerToken, { name: 'Rice', sku: 'RICE', hsnCode: '1006', purchasePricePaise: 10000, sellingPricePaise: 21000, priceIncludesGst: true, gstRate: 5, openingStock: 50 });
  C0 = await mkProduct(shop.ownerToken, { name: 'Milk', sku: 'MILK', hsnCode: '0401', purchasePricePaise: 2000, sellingPricePaise: 5000, priceIncludesGst: false, gstRate: 0, openingStock: 50 });

  // 1. Biscuits x2 -> 23,600 (taxable 20,000 + CGST 1,800 + SGST 1,800)
  const inv1 = (await sell(shop.ownerToken, [{ productId: A._id, qty: 2 }])).body.data;
  // 2. Rice x1, price includes GST -> 21,000 (taxable 20,000 + tax 1,000)
  await sell(shop.ownerToken, [{ productId: B._id, qty: 1 }]);
  // 3. B2B, inter-state (Karnataka): Biscuits x1 -> 11,800 (IGST 1,800)
  await sell(shop.ownerToken, [{ productId: A._id, qty: 1 }], { customer: { name: 'Karnataka Traders', gstin: buyerGstin } });
  // 4. Milk x3, 0% -> 15,000
  await sell(shop.ownerToken, [{ productId: C0._id, qty: 3 }]);
  // 5. Return 1 Biscuit from invoice 1 -> credit note 11,800 (taxable 10,000, CGST 900, SGST 900)
  await post(`/invoices/${inv1._id}/returns`, shop.ownerToken, {
    clientRequestId: randomUUID(),
    items: [{ invoiceItemId: inv1.items[0]._id, qty: 1 }],
    refundMode: 'CASH',
    reason: 'Customer changed mind',
  });
  // 6. Purchase AFTER the sales so the cost snapshots above are unaffected: 10 x ₹60 + 18% from a Maharashtra supplier
  const supplier = (await post('/suppliers', shop.ownerToken, { name: 'Metro Wholesale', gstin: gstinFor('27', 'FGHIJ5678K1Z') })).body.data;
  await post('/purchases', shop.ownerToken, {
    supplierId: supplier._id,
    supplierInvoiceNo: 'MW/1',
    purchaseDate: today,
    items: [{ productId: A._id, qty: 10, unitCostPaise: 6000 }],
  });
});
afterAll(stopTestApp);

describe('Sales reports', () => {
  test('daily sales: invoices minus credit notes, zero-filled', async () => {
    const r = await report('/reports/sales/daily');
    const rows = sheetOf(r, 'sales').rows;
    expect(rows.map((x) => x.period)).toEqual([yesterday, today]);
    expect(rows[0].invoices).toBe(0);
    expect(rows[1]).toMatchObject({
      invoices: 4,
      grossPaise: 66000,
      taxablePaise: 65000,
      taxPaise: 6400,
      salesPaise: 71400,
      creditNotes: 1,
      returnsPaise: 11800,
      netTaxablePaise: 55000,
      netSalesPaise: 59600,
    });
    expect(r.summary).toMatchObject({ salesPaise: 71400, netSalesPaise: 59600 });
  });

  test('monthly sales', async () => {
    const res = await get(`/reports/sales/monthly?from=${today.slice(0, 7)}-01&to=${today}`, shop.ownerToken);
    const rows = sheetOf(res.body.data, 'sales').rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period: today.slice(0, 7), invoices: 4, netSalesPaise: 59600 });
  });

  test('top products net out returns', async () => {
    const byQty = (await report('/reports/top-products', shop.ownerToken, '&sortBy=qty')).sheets[0].rows;
    expect(byQty.map((r) => r.name)).toEqual(['Milk', 'Biscuits', 'Rice']);
    expect(byQty[1]).toMatchObject({ qtySold: 3, qtyReturned: 1, netQty: 2, revenuePaise: 30000, returnedPaise: 10000, netRevenuePaise: 20000, rank: 2 });

    const byRevenue = (await report('/reports/top-products', shop.ownerToken, '&limit=2')).sheets[0].rows;
    expect(byRevenue).toHaveLength(2);
    expect(byRevenue.map((r) => r.name).sort()).toEqual(['Biscuits', 'Rice']); // 20,000 each, ahead of Milk's 15,000
  });
});

describe('Profit', () => {
  test('by day: net taxable sales minus cost, with returned goods reversing their cost', async () => {
    const r = await report('/reports/profit', shop.ownerToken, '&groupBy=day');
    const row = sheetOf(r, 'profit').rows.find((x) => x.period === today);
    // cost: 10,000 + 10,000 + 5,000 + 6,000 - 5,000 (returned biscuit back on the shelf) = 26,000
    expect(row).toMatchObject({ revenuePaise: 55000, costPaise: 26000, profitPaise: 29000, marginPct: 52.73 });
  });

  test('by product', async () => {
    const r = await report('/reports/profit', shop.ownerToken, '&groupBy=product');
    const rows = sheetOf(r, 'profit').rows;
    expect(rows.map((x) => [x.name, x.profitPaise, x.marginPct])).toEqual([
      ['Biscuits', 10000, 50],
      ['Rice', 10000, 50],
      ['Milk', 9000, 60],
    ]);
  });

  test('profit needs the cost permission and a valid grouping', async () => {
    expect((await get(`/reports/profit?from=${today}&to=${today}`, shop.cashierToken)).status).toBe(403);
    expect((await get(`/reports/profit?groupBy=week`, shop.ownerToken)).status).toBe(400);
  });
});

describe('Stock valuation', () => {
  test('values normal, fractional and batch products correctly', async () => {
    const vs = await createShop(app);
    const X = await mkProduct(vs.ownerToken, { name: 'Alpha', sku: 'X', purchasePricePaise: 5000, sellingPricePaise: 10000, gstRate: 5, openingStock: 10 });
    await mkProduct(vs.ownerToken, { name: 'Beta kg', sku: 'Y', unit: 'KG', purchasePricePaise: 8000, sellingPricePaise: 12000, gstRate: 5, openingStock: 2.5 });
    const Z = await mkProduct(vs.ownerToken, { name: 'Gamma batch', sku: 'Z', sellingPricePaise: 9000, gstRate: 5, trackBatches: true });
    await mkProduct(vs.ownerToken, { name: 'Zero stock', sku: 'W', sellingPricePaise: 1000, gstRate: 5 });
    await post(`/products/${Z._id}/batches`, vs.ownerToken, { batchNo: 'B1', expiryDate: '2030-01-01', qty: 4, purchasePricePaise: 3000 });
    await post(`/products/${Z._id}/batches`, vs.ownerToken, { batchNo: 'B2', expiryDate: '2031-01-01', qty: 6, purchasePricePaise: 4000 });

    const res = await get('/reports/stock-valuation', vs.managerToken);
    const r = res.body.data;
    const rows = sheetOf(r, 'stock').rows;
    expect(rows.map((x) => x.sku)).toEqual(['X', 'Y', 'Z']); // zero stock excluded by default
    expect(rows[0]).toMatchObject({ stockQty: 10, costValuePaise: 50000, retailValuePaise: 100000 });
    expect(rows[1]).toMatchObject({ stockQty: 2.5, costValuePaise: 20000, retailValuePaise: 30000 });
    expect(rows[2]).toMatchObject({ stockQty: 10, unitCostPaise: 3600, costValuePaise: 36000, retailValuePaise: 90000 }); // 4 x 30 + 6 x 40
    expect(r.summary).toMatchObject({ items: 3, totalCostPaise: 106000, totalRetailPaise: 220000 });

    const all = await get('/reports/stock-valuation?includeZero=true', vs.ownerToken);
    expect(sheetOf(all.body.data, 'stock').rows).toHaveLength(4);
    expect((await get('/reports/stock-valuation', vs.cashierToken)).status).toBe(403);
    expect(X._id).toBeTruthy();
  });
});

describe('Dashboard', () => {
  test('summarises today, the month, dues and collections', async () => {
    const res = await get('/dashboard/summary', shop.managerToken);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.today).toMatchObject({ invoices: 4, salesPaise: 71400, returnsPaise: 11800, netSalesPaise: 59600 });
    expect(d.month.salesPaise).toBe(71400);
    expect(d.last7Days).toHaveLength(7);
    expect(d.last7Days[6]).toMatchObject({ date: today, salesPaise: 71400 });
    expect(d.collectionsToday).toEqual([{ mode: 'CASH', amountPaise: 71400 }]);
    expect(d.receivables.totalPaise).toBe(0);
    expect(d.payables).toMatchObject({ totalPaise: 70800, suppliers: 1 }); // the unpaid purchase
    expect(d.alerts.lowStockCount).toBe(0);
    expect(d.topProducts).toHaveLength(3);
    expect((await get('/dashboard/summary', shop.cashierToken)).status).toBe(403);
  });
});

describe('GSTR-1', () => {
  let r;
  beforeAll(async () => {
    r = await report('/reports/gst/gstr1');
  });

  test('B2B: the inter-state invoice to a registered buyer, with IGST', () => {
    const rows = sheetOf(r, 'b2b').rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gstin: buyerGstin,
      receiverName: 'Karnataka Traders',
      invoiceValuePaise: 11800,
      placeOfSupply: '29-Karnataka',
      reverseCharge: 'N',
      ratePct: 18,
      taxablePaise: 10000,
      igstPaise: 1800,
      cgstPaise: 0,
    });
  });

  test('B2CL, CDNR and CDNUR are empty; B2CS is net of the small B2C credit note', () => {
    expect(sheetOf(r, 'b2cl').rows).toHaveLength(0);
    expect(sheetOf(r, 'cdnr').rows).toHaveLength(0);
    expect(sheetOf(r, 'cdnur').rows).toHaveLength(0);

    const rows = sheetOf(r, 'b2cs').rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: 'OE', placeOfSupply: '27-Maharashtra', ratePct: 5, taxablePaise: 20000, cgstPaise: 500, sgstPaise: 500 });
    expect(rows[1]).toMatchObject({ ratePct: 18, taxablePaise: 10000, cgstPaise: 900, sgstPaise: 900 }); // 20,000 sold - 10,000 returned
  });

  test('0% supplies are nil-rated, not taxable', () => {
    const rows = sheetOf(r, 'nil_exempt').rows;
    expect(rows[3]).toMatchObject({ description: 'Intra-State supplies to unregistered persons', nilRatedPaise: 15000 });
    expect(rows.slice(0, 3).every((x) => x.nilRatedPaise === 0)).toBe(true);
  });

  test('HSN summary is split into B2B and B2C and is net of returns', () => {
    expect(sheetOf(r, 'hsn_b2b').rows).toEqual([
      expect.objectContaining({ hsnCode: '1905', uqc: 'PCS', quantity: 1, ratePct: 18, totalValuePaise: 11800, taxablePaise: 10000, igstPaise: 1800 }),
    ]);
    const b2c = sheetOf(r, 'hsn_b2c').rows;
    expect(b2c.map((x) => x.hsnCode)).toEqual(['0401', '1006', '1905']);
    expect(b2c[0]).toMatchObject({ quantity: 3, ratePct: 0, totalValuePaise: 15000, taxablePaise: 15000 });
    expect(b2c[1]).toMatchObject({ quantity: 1, ratePct: 5, totalValuePaise: 21000, taxablePaise: 20000, cgstPaise: 500 });
    expect(b2c[2]).toMatchObject({ quantity: 1, ratePct: 18, totalValuePaise: 11800, taxablePaise: 10000, cgstPaise: 900 }); // 2 sold, 1 returned
  });

  test('the dedicated HSN endpoint returns the same two tables', async () => {
    const h = await report('/reports/gst/hsn-summary');
    expect(h.sheets.map((s) => s.key)).toEqual(['hsn_b2b', 'hsn_b2c']);
    expect(sheetOf(h, 'hsn_b2c').rows).toEqual(sheetOf(r, 'hsn_b2c').rows);
  });
});

describe('GSTR-3B', () => {
  test('output tax, input tax and the set-off', async () => {
    const r = await report('/reports/gst/gstr3b');
    const rows = r.sheets[0].rows;

    expect(rows.find((x) => x.section === '3.1(a)')).toMatchObject({ taxablePaise: 40000, igstPaise: 1800, cgstPaise: 1400, sgstPaise: 1400 });
    expect(rows.find((x) => x.section === '3.1(c)')).toMatchObject({ taxablePaise: 15000 });
    expect(rows.find((x) => x.section === '3.2')).toBeUndefined(); // the only inter-state sale was B2B
    expect(rows.find((x) => x.section === '4A(5)')).toMatchObject({ igstPaise: 0, cgstPaise: 5400, sgstPaise: 5400 });

    expect(r.summary).toMatchObject({
      outputTax: { igstPaise: 1800, cgstPaise: 1400, sgstPaise: 1400 },
      itcAvailable: { igstPaise: 0, cgstPaise: 5400, sgstPaise: 5400 },
      paidThroughItc: { igstPaise: 1800, cgstPaise: 1400, sgstPaise: 1400 }, // surplus CGST credit paid the IGST
      cashPayable: { igstPaise: 0, cgstPaise: 0, sgstPaise: 0 },
      carryForwardItc: { igstPaise: 0, cgstPaise: 2200, sgstPaise: 4000 },
    });
  });

  test('GSTR-1 and GSTR-3B reconcile', async () => {
    const g1 = await report('/reports/gst/gstr1');
    const g3b = await report('/reports/gst/gstr3b');
    const row = g3b.sheets[0].rows.find((x) => x.section === '3.1(a)');

    expect(g1.summary.netTaxablePaise).toBe(row.taxablePaise);
    expect(g1.summary.netIgstPaise).toBe(row.igstPaise);
    expect(g1.summary.netCgstPaise).toBe(row.cgstPaise);
    const tableTaxable = ['b2b', 'b2cl', 'b2cs'].flatMap((k) => sheetOf(g1, k).rows).reduce((a, x) => a + x.taxablePaise, 0);
    expect(tableTaxable).toBe(row.taxablePaise);
  });
});

describe('Exports', () => {
  test('a multi-table report needs ?table= for CSV', async () => {
    const res = await get(`/reports/gst/gstr1?from=${today}&to=${today}&format=csv`, shop.ownerToken);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('b2b');
  });

  test('CSV: BOM, IST dates and exact rupee amounts', async () => {
    const res = await download(`/reports/gst/gstr1?from=${today}&to=${today}&format=csv&table=b2b`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/gstr1-b2b_/);
    const text = res.body.toString('utf8');
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain(buyerGstin);
    expect(text).toContain('118.00'); // invoice value
    expect(text).toContain('18.00'); // IGST
    expect(text).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  test('Excel: one tab per table, real numbers', async () => {
    const res = await download(`/reports/gst/gstr1?from=${today}&to=${today}&format=xlsx`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.body.subarray(0, 2).toString()).toBe('PK');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'B2B', 'B2CL', 'B2CS', 'CDNR', 'CDNUR', 'Nil-Exempt', 'HSN-B2B', 'HSN-B2C']);
    expect(wb.getWorksheet('B2B').getRow(2).getCell(5).value).toBe(118); // invoice value, as a number
  });

  test('a single-table report downloads without ?table=', async () => {
    const res = await download(`/reports/sales/daily?from=${today}&to=${today}&format=csv`);
    expect(res.status).toBe(200);
    expect(res.body.toString('utf8')).toContain('715.00');
  });

  test('formulas in product names cannot execute in the exported file', async () => {
    const evil = await mkProduct(plain.ownerToken, { name: '=HYPERLINK("http://evil.example","x")', sku: 'EVIL', sellingPricePaise: 10000, gstRate: 5, openingStock: 5 });
    await post('/invoices', plain.ownerToken, { clientRequestId: randomUUID(), items: [{ productId: evil._id, qty: 1 }], payments: [{ mode: 'CASH' }] });

    const res = await download(`/reports/top-products?from=${today}&to=${today}&format=csv`, plain.ownerToken);
    const text = res.body.toString('utf8');
    expect(text).toContain(`"'=HYPERLINK(`);
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});

describe('Access and validation', () => {
  test('cashiers get no reports; managers do', async () => {
    expect((await get('/reports/sales/daily', shop.cashierToken)).status).toBe(403);
    expect((await get('/reports/gst/gstr1', shop.cashierToken)).status).toBe(403);
    expect((await get('/reports/sales/daily', shop.managerToken)).status).toBe(200);
  });

  test('GST reports are for regular taxpayers only', async () => {
    for (const path of ['gstr1', 'gstr3b', 'hsn-summary']) {
      expect((await get(`/reports/gst/${path}`, plain.ownerToken)).status).toBe(409);
    }
    expect((await get('/reports/sales/daily', plain.ownerToken)).status).toBe(200); // sales reports work for everyone
  });

  test('bad dates and formats are rejected', async () => {
    expect((await get('/reports/sales/daily?from=2026-10-05&to=2026-10-01', shop.ownerToken)).status).toBe(400);
    expect((await get('/reports/sales/daily?from=2025-01-01&to=2026-12-31', shop.ownerToken)).status).toBe(400);
    expect((await get('/reports/sales/daily?format=pdf', shop.ownerToken)).status).toBe(400);
    expect((await get('/reports/sales/daily?from=01-10-2026', shop.ownerToken)).status).toBe(400);
  });

  test('requires authentication', async () => {
    expect((await request(app).get('/api/v1/reports/sales/daily')).status).toBe(401);
  });
});