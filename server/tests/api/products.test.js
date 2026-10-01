import request from 'supertest';
import { startTestApp, stopTestApp, createShop, bearer } from '../helpers/testApp.js';

let app;
let shopA;
let shopB;
let n = 0;
const next = () => (n += 1);

const productBody = (overrides = {}) => ({
  name: `Parle-G ${next()}`,
  sku: `sku-${next()}`,
  hsnCode: '1905',
  unit: 'PCS',
  purchasePricePaise: 800,
  sellingPricePaise: 1000,
  mrpPaise: 1000,
  gstRate: 5,
  openingStock: 10,
  reorderLevel: 3,
  ...overrides,
});

const create = (token, overrides) =>
  request(app).post('/api/v1/products').set(bearer(token)).send(productBody(overrides));

const adjust = (token, id, body) =>
  request(app).post(`/api/v1/products/${id}/stock-adjustments`).set(bearer(token)).send(body);

const getProduct = (token, id) => request(app).get(`/api/v1/products/${id}`).set(bearer(token));

beforeAll(async () => {
  app = await startTestApp();
  shopA = await createShop(app);
  shopB = await createShop(app);
});
afterAll(stopTestApp);

describe('Product CRUD and validation', () => {
  test('creates a product with opening stock and an OPENING ledger entry', async () => {
    const res = await create(shopA.ownerToken, { sku: 'abc-1' });
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe('ABC-1');
    expect(res.body.data.stockQty).toBe(10);
    expect(res.body.data.purchasePricePaise).toBe(800);

    const history = await request(app)
      .get(`/api/v1/products/${res.body.data._id}/stock-movements`)
      .set(bearer(shopA.ownerToken));
    expect(history.status).toBe(200);
    expect(history.body.data[0].type).toBe('OPENING');
    expect(history.body.data[0].qtyAfter).toBe(10);
    expect(history.body.data[0].performedBy.name).toBe('Owner One');
  });

  test('rejects fractional quantity for PCS but allows it for KG', async () => {
    expect((await create(shopA.ownerToken, { openingStock: 1.5 })).status).toBe(400);
    const kg = await create(shopA.ownerToken, { unit: 'KG', openingStock: 1.5 });
    expect(kg.status).toBe(201);
    expect(kg.body.data.stockQty).toBe(1.5);
  });

  test('rejects an old 12% GST rate and a selling price above MRP', async () => {
    expect((await create(shopA.ownerToken, { gstRate: 12 })).status).toBe(400);
    expect((await create(shopA.ownerToken, { sellingPricePaise: 1200 })).status).toBe(400);
  });

  test('duplicate SKU and barcode give 409; missing barcodes never collide', async () => {
    await create(shopA.ownerToken, { sku: 'DUP-1', barcode: '8901234567890' });
    expect((await create(shopA.ownerToken, { sku: 'DUP-1' })).status).toBe(409);
    expect((await create(shopA.ownerToken, { barcode: '8901234567890' })).status).toBe(409);
    expect((await create(shopA.ownerToken)).status).toBe(201);
    expect((await create(shopA.ownerToken)).status).toBe(201);
  });

  test('update can clear MRP; soft delete hides the product from lists', async () => {
    const p = (await create(shopA.ownerToken)).body.data;
    const upd = await request(app)
      .patch(`/api/v1/products/${p._id}`)
      .set(bearer(shopA.ownerToken))
      .send({ mrpPaise: null, sellingPricePaise: 1500 });
    expect(upd.status).toBe(200);
    expect(upd.body.data.mrpPaise).toBeUndefined();

    await request(app).delete(`/api/v1/products/${p._id}`).set(bearer(shopA.ownerToken));
    const list = await request(app)
      .get(`/api/v1/products?q=${encodeURIComponent(p.name)}`)
      .set(bearer(shopA.ownerToken));
    expect(list.body.data).toHaveLength(0);
  });

  test('name search matches partial words, case-insensitively', async () => {
    await create(shopA.ownerToken, { name: 'Tata Salt Vacuum 1kg' });
    const res = await request(app).get('/api/v1/products?q=salt%20vac').set(bearer(shopA.ownerToken));
    expect(res.body.data.some((p) => p.name === 'Tata Salt Vacuum 1kg')).toBe(true);
  });
});

describe('Roles and tenant isolation', () => {
  test('cashier can read but not see cost, and cannot write', async () => {
    const p = (await create(shopA.ownerToken)).body.data;

    const asCashier = await getProduct(shopA.cashierToken, p._id);
    expect(asCashier.status).toBe(200);
    expect(asCashier.body.data.purchasePricePaise).toBeUndefined();
    expect(asCashier.body.data.sellingPricePaise).toBe(1000);

    expect((await getProduct(shopA.managerToken, p._id)).body.data.purchasePricePaise).toBe(800);
    expect((await create(shopA.cashierToken)).status).toBe(403);
    expect((await adjust(shopA.cashierToken, p._id, { type: 'ADJUSTMENT', qtyChange: 1, reason: 'test' })).status).toBe(403);
  });

  test("another shop can't see the product but can reuse its SKU", async () => {
    const p = (await create(shopA.ownerToken, { sku: 'SHARED-1' })).body.data;
    expect((await getProduct(shopB.ownerToken, p._id)).status).toBe(404);
    expect((await create(shopB.ownerToken, { sku: 'SHARED-1' })).status).toBe(201);
  });
});

describe('Barcode lookup', () => {
  test('finds a product; UPC-A and EAN-13 forms resolve to the same product', async () => {
    const p = (await create(shopA.ownerToken, { barcode: '036000291452' })).body.data;
    expect(p.barcode).toBe('0036000291452');

    for (const code of ['036000291452', '0036000291452']) {
      const res = await request(app).get(`/api/v1/products/barcode/${code}`).set(bearer(shopA.cashierToken));
      expect(res.status).toBe(200);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.product._id).toBe(p._id);
    }
  });

  test('unknown barcode returns 404 with found:false', async () => {
    const res = await request(app).get('/api/v1/products/barcode/9999999999999').set(bearer(shopA.cashierToken));
    expect(res.status).toBe(404);
    expect(res.body.data).toEqual({ found: false, barcode: '9999999999999' });
  });

  test('barcode of a deactivated product is reported as inactive', async () => {
    const p = (await create(shopA.ownerToken, { barcode: '8901111111116' })).body.data;
    await request(app).delete(`/api/v1/products/${p._id}`).set(bearer(shopA.ownerToken));
    const res = await request(app).get('/api/v1/products/barcode/8901111111116').set(bearer(shopA.ownerToken));
    expect(res.status).toBe(404);
    expect(res.body.data.inactive).toBe(true);
    expect(res.body.data.productId).toBe(p._id);
  });
});

describe('Stock adjustments', () => {
  test('applies a valid adjustment and records who and why', async () => {
    const p = (await create(shopA.ownerToken, { openingStock: 10 })).body.data;
    const res = await adjust(shopA.managerToken, p._id, { type: 'DAMAGE', qtyChange: -2, reason: 'Water damage' });
    expect(res.status).toBe(201);
    expect(res.body.data.product.stockQty).toBe(8);
    expect(res.body.data.movement).toMatchObject({ qtyBefore: 10, qtyAfter: 8, qtyChange: -2, type: 'DAMAGE' });
  });

  test('rejects going negative (409), a missing reason and a wrong-sign DAMAGE (400)', async () => {
    const p = (await create(shopA.ownerToken, { openingStock: 2 })).body.data;
    expect((await adjust(shopA.ownerToken, p._id, { type: 'ADJUSTMENT', qtyChange: -5, reason: 'oops' })).status).toBe(409);
    expect((await adjust(shopA.ownerToken, p._id, { type: 'ADJUSTMENT', qtyChange: 1 })).status).toBe(400);
    expect((await adjust(shopA.ownerToken, p._id, { type: 'DAMAGE', qtyChange: 1, reason: 'wrong sign' })).status).toBe(400);
    expect((await getProduct(shopA.ownerToken, p._id)).body.data.stockQty).toBe(2);
  });

  test('two concurrent adjustments for the last units: exactly one wins, stock never goes negative', async () => {
    const p = (await create(shopA.ownerToken, { openingStock: 5 })).body.data;
    const attempt = () => adjust(shopA.ownerToken, p._id, { type: 'ADJUSTMENT', qtyChange: -3, reason: 'race test' });

    const results = await Promise.all([attempt(), attempt()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await getProduct(shopA.ownerToken, p._id)).body.data.stockQty).toBe(2);
  });

  test('low-stock list includes only products at or below the reorder level', async () => {
    const low = (await create(shopA.ownerToken, { openingStock: 2, reorderLevel: 5 })).body.data;
    const fine = (await create(shopA.ownerToken, { openingStock: 50, reorderLevel: 5 })).body.data;
    const res = await request(app).get('/api/v1/products/low-stock?limit=100').set(bearer(shopA.ownerToken));
    const ids = res.body.data.map((p) => p._id);
    expect(ids).toContain(low._id);
    expect(ids).not.toContain(fine._id);
  });
});

describe('Batch-tracked products', () => {
  test('stock flows only through batches and stays consistent', async () => {
    const withStock = await create(shopA.ownerToken, { trackBatches: true, openingStock: 5 });
    expect(withStock.status).toBe(400);

    const p = (await create(shopA.ownerToken, { trackBatches: true, openingStock: 0 })).body.data;
    const url = `/api/v1/products/${p._id}/batches`;

    const received = await request(app)
      .post(url)
      .set(bearer(shopA.ownerToken))
      .send({ batchNo: 'B1', expiryDate: '2027-03-31', qty: 20, purchasePricePaise: 700 });
    expect(received.status).toBe(201);
    expect(received.body.data.product.stockQty).toBe(20);
    expect(received.body.data.batch.qtyRemaining).toBe(20);
    const batchId = received.body.data.batch._id;

    // A batch product needs a batchId; the failed attempt rolls back completely.
    expect((await adjust(shopA.ownerToken, p._id, { type: 'ADJUSTMENT', qtyChange: -1, reason: 'no batch' })).status).toBe(400);
    expect((await getProduct(shopA.ownerToken, p._id)).body.data.stockQty).toBe(20);

    const expired = await adjust(shopA.ownerToken, p._id, { type: 'EXPIRED', qtyChange: -5, reason: 'Expired', batchId });
    expect(expired.status).toBe(201);
    expect(expired.body.data.product.stockQty).toBe(15);
    expect(expired.body.data.batch.qtyRemaining).toBe(15);

    const conflict = await request(app)
      .post(url)
      .set(bearer(shopA.ownerToken))
      .send({ batchNo: 'B1', expiryDate: '2028-01-01', qty: 5 });
    expect(conflict.status).toBe(409);
    expect((await getProduct(shopA.ownerToken, p._id)).body.data.stockQty).toBe(15);

    const list = await request(app).get(url).set(bearer(shopA.cashierToken));
    expect(list.body.data[0].qtyRemaining).toBe(15);
    expect(list.body.data[0].purchasePricePaise).toBeUndefined(); // hidden from cashier
  });
});