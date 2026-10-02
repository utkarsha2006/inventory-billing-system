import request from 'supertest';
import { startTestApp, stopTestApp, createShop, bearer } from '../helpers/testApp.js';
import { gstinChecksum } from '../../src/utils/gstin.js';

let app;
let shop; // REGULAR, Maharashtra (27)
let plain; // UNREGISTERED
let n = 0;
const next = () => (n += 1);

const post = (path, token, body) => request(app).post(`/api/v1${path}`).set(bearer(token)).send(body);
const get = (path, token) => request(app).get(`/api/v1${path}`).set(bearer(token));

const gstinFor = (state, body = 'ABCDE1234F1Z') => {
  const base = `${state}${body}`;
  return base + gstinChecksum(base);
};
const today = () => new Date().toISOString().slice(0, 10);

const mkSupplier = async (token, o = {}) =>
  (await post('/suppliers', token, { name: `Supplier ${next()}`, gstin: gstinFor('27'), ...o })).body.data;

const mkProduct = async (token, o = {}) =>
  (
    await post('/products', token, {
      name: `Item ${next()}`,
      sku: `P-${next()}`,
      hsnCode: '1905',
      unit: 'PCS',
      purchasePricePaise: 5000,
      sellingPricePaise: 10000,
      priceIncludesGst: false,
      gstRate: 18,
      openingStock: 10,
      ...o,
    })
  ).body.data;

const buy = (token, supplierId, items, o = {}) =>
  post('/purchases', token, { supplierId, supplierInvoiceNo: `SI-${next()}`, purchaseDate: today(), items, ...o });

const stockOf = async (token, id) => (await get(`/products/${id}`, token)).body.data;

beforeAll(async () => {
  app = await startTestApp();
  shop = await createShop(app, { gstRegistrationType: 'REGULAR', gstin: '27AAPFU0939F1ZV' });
  plain = await createShop(app);
});
afterAll(stopTestApp);

describe('Suppliers', () => {
  test('state and registration type are derived from the GSTIN', async () => {
    const res = await post('/suppliers', shop.ownerToken, { name: 'Karnataka Foods', gstin: gstinFor('29') });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ stateCode: '29', gstRegistrationType: 'REGULAR' });
  });

  test('rejects a mismatched state, and an unregistered supplier with no state', async () => {
    expect((await post('/suppliers', shop.ownerToken, { name: 'X', gstin: gstinFor('29', 'FGHIJ5678K1Z'), stateCode: '27' })).status).toBe(400);
    expect((await post('/suppliers', shop.ownerToken, { name: 'No State' })).status).toBe(400);
    expect((await post('/suppliers', shop.ownerToken, { name: 'Local Mandi', stateCode: '27' })).body.data.gstRegistrationType).toBe('UNREGISTERED');
  });

  test('cashiers cannot manage suppliers', async () => {
    expect((await post('/suppliers', shop.cashierToken, { name: 'Nope', stateCode: '27' })).status).toBe(403);
  });
});

describe('Purchases and input tax', () => {
  test('intra-state purchase: CGST+SGST, stock in, weighted-average cost, supplier dues, settlement', async () => {
    const supplier = await mkSupplier(shop.ownerToken, { gstin: gstinFor('27', 'FGHIJ5678K1Z') });
    const product = await mkProduct(shop.ownerToken); // 10 in stock at ₹50

    const res = await buy(shop.managerToken, supplier._id, [{ productId: product._id, qty: 20, unitCostPaise: 6000 }]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ supplyType: 'INTRA', itcEligible: true, paymentStatus: 'UNPAID', balanceDuePaise: 141600 });
    expect(res.body.data.totals).toMatchObject({ taxablePaise: 120000, cgstPaise: 10800, sgstPaise: 10800, igstPaise: 0, grandTotalPaise: 141600 });

    const after = await stockOf(shop.ownerToken, product._id);
    expect(after.stockQty).toBe(30);
    expect(after.purchasePricePaise).toBe(5667); // (10 x 50 + 20 x 60) / 30 = 56.67

    expect((await get(`/suppliers/${supplier._id}`, shop.ownerToken)).body.data.outstandingPaise).toBe(141600);

    const id = res.body.data._id;
    const part = await post(`/purchases/${id}/payments`, shop.ownerToken, { mode: 'UPI', amountPaise: 100000, reference: 'UTR9' });
    expect(part.body.data).toMatchObject({ balanceDuePaise: 41600, paymentStatus: 'PARTIAL' });
    expect((await post(`/purchases/${id}/payments`, shop.ownerToken, { mode: 'CASH', amountPaise: 50000 })).status).toBe(409);

    const rest = await post(`/purchases/${id}/payments`, shop.ownerToken, { mode: 'CASH', amountPaise: 41600 });
    expect(rest.body.data.paymentStatus).toBe('PAID');
    expect((await get(`/suppliers/${supplier._id}`, shop.ownerToken)).body.data.outstandingPaise).toBe(0);
  });

  test('inter-state purchase uses IGST', async () => {
    const supplier = await mkSupplier(shop.ownerToken, { gstin: gstinFor('29', 'KLMNO1234P1Z') });
    const product = await mkProduct(shop.ownerToken);
    const res = await buy(shop.ownerToken, supplier._id, [{ productId: product._id, qty: 10, unitCostPaise: 10000 }]);
    expect(res.body.data.supplyType).toBe('INTER');
    expect(res.body.data.totals).toMatchObject({ igstPaise: 18000, cgstPaise: 0, sgstPaise: 0, grandTotalPaise: 118000 });
  });

  test('the same supplier invoice cannot be entered twice, but another supplier may reuse the number', async () => {
    const a = await mkSupplier(shop.ownerToken, { gstin: gstinFor('27', 'PQRST1234U1Z') });
    const b = await mkSupplier(shop.ownerToken, { gstin: gstinFor('27', 'VWXYZ1234A1Z') });
    const product = await mkProduct(shop.ownerToken);
    const items = [{ productId: product._id, qty: 1, unitCostPaise: 1000 }];

    expect((await buy(shop.ownerToken, a._id, items, { supplierInvoiceNo: 'dup-1' })).status).toBe(201);
    expect((await buy(shop.ownerToken, a._id, items, { supplierInvoiceNo: 'DUP-1' })).status).toBe(409);
    expect((await buy(shop.ownerToken, b._id, items, { supplierInvoiceNo: 'DUP-1' })).status).toBe(201);
  });

  test('unregistered supplier: no GST is charged and no ITC is claimed', async () => {
    const supplier = (await post('/suppliers', shop.ownerToken, { name: 'Village Trader', stateCode: '27' })).body.data;
    const product = await mkProduct(shop.ownerToken);
    const res = await buy(shop.ownerToken, supplier._id, [{ productId: product._id, qty: 5, unitCostPaise: 10000 }]);
    expect(res.body.data.itcEligible).toBe(false);
    expect(res.body.data.totals).toMatchObject({ taxablePaise: 50000, cgstPaise: 0, sgstPaise: 0, grandTotalPaise: 50000 });
  });

  test('a shop that cannot claim ITC treats the GST it paid as cost', async () => {
    const supplier = await mkSupplier(plain.ownerToken, { gstin: gstinFor('27', 'ABCDE1234F1Z') });
    const product = await mkProduct(plain.ownerToken, { openingStock: 0 });
    const res = await buy(plain.ownerToken, supplier._id, [{ productId: product._id, qty: 10, unitCostPaise: 10000 }]);
    expect(res.body.data.itcEligible).toBe(false);
    expect(res.body.data.totals.grandTotalPaise).toBe(118000);
    expect((await stockOf(plain.ownerToken, product._id)).purchasePricePaise).toBe(11800); // ₹118 per unit
  });

  test("the supplier's printed total reconciles within ₹1, and a big mismatch is rejected", async () => {
    const supplier = await mkSupplier(shop.ownerToken, { gstin: gstinFor('27', 'BCDEF1234G1Z') });
    const product = await mkProduct(shop.ownerToken);
    const items = [{ productId: product._id, qty: 20, unitCostPaise: 6000 }]; // calculates to 141600

    const ok = await buy(shop.ownerToken, supplier._id, items, { supplierInvoiceTotalPaise: 141650 });
    expect(ok.status).toBe(201);
    expect(ok.body.data.totals).toMatchObject({ roundOffPaise: 50, grandTotalPaise: 141650 });

    expect((await buy(shop.ownerToken, supplier._id, items, { supplierInvoiceTotalPaise: 150000 })).status).toBe(400);
  });

  test('batch products need a batch, and the batch records its purchase and cost', async () => {
    const supplier = await mkSupplier(shop.ownerToken, { gstin: gstinFor('27', 'CDEFG1234H1Z') });
    const product = await mkProduct(shop.ownerToken, { trackBatches: true, openingStock: 0 });

    const noBatch = await buy(shop.ownerToken, supplier._id, [{ productId: product._id, qty: 12, unitCostPaise: 4000 }]);
    expect(noBatch.status).toBe(400);

    const res = await buy(shop.ownerToken, supplier._id, [
      { productId: product._id, qty: 12, unitCostPaise: 4000, batchNo: 'LOT1', expiryDate: '2030-06-30' },
    ]);
    expect(res.status).toBe(201);

    const batches = (await get(`/products/${product._id}/batches`, shop.ownerToken)).body.data;
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ batchNo: 'LOT1', qtyRemaining: 12, purchasePricePaise: 4000, purchaseId: res.body.data._id });
    expect((await stockOf(shop.ownerToken, product._id)).stockQty).toBe(12);
  });

  test('validation: overpaying, future dates, and unauthorised roles', async () => {
    const supplier = await mkSupplier(shop.ownerToken, { gstin: gstinFor('27', 'DEFGH1234J1Z') });
    const product = await mkProduct(shop.ownerToken);
    const items = [{ productId: product._id, qty: 1, unitCostPaise: 1000 }];

    expect((await buy(shop.ownerToken, supplier._id, items, { payments: [{ mode: 'CASH', amountPaise: 999999 }] })).status).toBe(400);
    expect((await buy(shop.ownerToken, supplier._id, items, { purchaseDate: '2999-01-01' })).status).toBe(400);
    expect((await buy(shop.cashierToken, supplier._id, items)).status).toBe(403);
    expect((await get('/purchases', shop.cashierToken)).status).toBe(403);
    expect((await get('/purchases', shop.managerToken)).status).toBe(200);
  });
});