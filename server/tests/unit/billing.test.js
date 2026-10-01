import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { startTestApp, stopTestApp, createShop, bearer } from '../helpers/testApp.js';
import { gstinChecksum } from '../../src/utils/gstin.js';

let app;
let shop; // GST-registered (REGULAR), Maharashtra (27)
let plain; // unregistered shop
let n = 0;
const next = () => (n += 1);

const post = (path, token, body) => request(app).post(`/api/v1${path}`).set(bearer(token)).send(body);
const get = (path, token) => request(app).get(`/api/v1${path}`).set(bearer(token));

// ₹100 exclusive of 18% GST, cost ₹50, stock 50
const mkProduct = async (token, o = {}) =>
  (
    await post('/products', token, {
      name: `Item ${next()}`,
      sku: `T-${next()}`,
      hsnCode: '1905',
      unit: 'PCS',
      purchasePricePaise: 5000,
      sellingPricePaise: 10000,
      priceIncludesGst: false,
      gstRate: 18,
      openingStock: 50,
      ...o,
    })
  ).body.data;

const bill = (token, items, o = {}) =>
  post('/invoices', token, { clientRequestId: randomUUID(), items, payments: [{ mode: 'CASH' }], ...o });

const stockOf = async (id) => (await get(`/products/${id}`, shop.ownerToken)).body.data.stockQty;
const seqOf = (res) => parseInt(res.body.data.invoiceNo.split('/')[2], 10);

beforeAll(async () => {
  app = await startTestApp();
  shop = await createShop(app, { gstRegistrationType: 'REGULAR', gstin: '27AAPFU0939F1ZV' });
  plain = await createShop(app); // UNREGISTERED by default
});
afterAll(stopTestApp);

describe('GST calculation through the API', () => {
  test('intra-state B2C tax invoice, exclusive pricing, stock deducted', async () => {
    const p = await mkProduct(shop.ownerToken);
    const res = await bill(shop.ownerToken, [{ productId: p._id, qty: 2 }]);

    expect(res.status).toBe(201);
    const inv = res.body.data;
    expect(inv.invoiceNo).toMatch(/^INV\/\d{4}-\d{2}\/\d{4}$/);
    expect(inv).toMatchObject({ documentType: 'TAX_INVOICE', invoiceType: 'B2C', supplyType: 'INTRA', paymentStatus: 'PAID' });
    expect(inv.totals).toMatchObject({
      taxablePaise: 20000,
      cgstPaise: 1800,
      sgstPaise: 1800,
      igstPaise: 0,
      roundOffPaise: 0,
      grandTotalPaise: 23600,
    });
    expect(inv.shopSnapshot.gstin).toBe('27AAPFU0939F1ZV');
    expect(inv.taxSummary).toHaveLength(1);
    expect(await stockOf(p._id)).toBe(48);
  });

  test('inclusive pricing backs the tax out of the price', async () => {
    const p = await mkProduct(shop.ownerToken, { sellingPricePaise: 11800, priceIncludesGst: true });
    const res = await bill(shop.ownerToken, [{ productId: p._id, qty: 1 }]);
    expect(res.body.data.totals).toMatchObject({ taxablePaise: 10000, cgstPaise: 900, sgstPaise: 900, grandTotalPaise: 11800 });
  });

  test('B2B sale to another state uses IGST and the buyer GSTIN state as place of supply', async () => {
    const p = await mkProduct(shop.ownerToken);
    const base = '29ABCDE1234F1Z';
    const gstin = base + gstinChecksum(base);

    const res = await bill(shop.ownerToken, [{ productId: p._id, qty: 1 }], {
      customer: { name: 'Karnataka Traders', gstin },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ invoiceType: 'B2B', supplyType: 'INTER', placeOfSupplyStateCode: '29' });
    expect(res.body.data.totals).toMatchObject({ igstPaise: 1800, cgstPaise: 0, sgstPaise: 0 });
  });

  test('rejects a customer GSTIN with a bad check digit', async () => {
    const p = await mkProduct(shop.ownerToken);
    const base = '29ABCDE1234F1Z';
    const wrong = base + (gstinChecksum(base) === 'A' ? 'B' : 'A');
    const res = await bill(shop.ownerToken, [{ productId: p._id, qty: 1 }], { customer: { name: 'X', gstin: wrong } });
    expect(res.status).toBe(400);
  });

  test('unregistered shop issues a Bill of Supply with no tax', async () => {
    const p = await mkProduct(plain.ownerToken);
    const res = await post('/invoices', plain.ownerToken, {
      clientRequestId: randomUUID(),
      items: [{ productId: p._id, qty: 1 }],
      payments: [{ mode: 'UPI', reference: 'UTR123' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.documentType).toBe('BILL_OF_SUPPLY');
    expect(res.body.data.totals).toMatchObject({ taxablePaise: 10000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, grandTotalPaise: 10000 });
  });

  test('preview computes totals but writes nothing', async () => {
    const p = await mkProduct(shop.ownerToken);
    const res = await post('/invoices/preview', shop.cashierToken, { items: [{ productId: p._id, qty: 3 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.totals.grandTotalPaise).toBe(35400);
    expect(await stockOf(p._id)).toBe(50);
  });
});

describe('Stock, numbering and idempotency', () => {
  test('a failed bill rolls back everything and leaves no gap in invoice numbers', async () => {
    const p = await mkProduct(shop.ownerToken, { openingStock: 3 });
    const first = await bill(shop.ownerToken, [{ productId: p._id, qty: 1 }]);
    const failed = await bill(shop.ownerToken, [{ productId: p._id, qty: 5 }]);
    const second = await bill(shop.ownerToken, [{ productId: p._id, qty: 1 }]);

    expect(failed.status).toBe(409);
    expect(seqOf(second)).toBe(seqOf(first) + 1);
    expect(await stockOf(p._id)).toBe(1);
  });

  test('if the second line fails, the first line stock is rolled back too', async () => {
    const ok = await mkProduct(shop.ownerToken, { openingStock: 10 });
    const scarce = await mkProduct(shop.ownerToken, { openingStock: 1 });
    const res = await bill(shop.ownerToken, [
      { productId: ok._id, qty: 2 },
      { productId: scarce._id, qty: 5 },
    ]);
    expect(res.status).toBe(409);
    expect(await stockOf(ok._id)).toBe(10);
  });

  test('the same clientRequestId returns the original invoice and deducts stock once', async () => {
    const p = await mkProduct(shop.ownerToken);
    const body = { clientRequestId: randomUUID(), items: [{ productId: p._id, qty: 2 }], payments: [{ mode: 'CASH' }] };

    const a = await post('/invoices', shop.ownerToken, body);
    const b = await post('/invoices', shop.ownerToken, body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.data._id).toBe(a.body.data._id);
    expect(b.body.meta.idempotentReplay).toBe(true);
    expect(await stockOf(p._id)).toBe(48);
  });

  test('two cashiers billing the last unit at once: exactly one succeeds', async () => {
    const p = await mkProduct(shop.ownerToken, { openingStock: 1 });
    const results = await Promise.all([
      bill(shop.ownerToken, [{ productId: p._id, qty: 1 }]),
      bill(shop.cashierToken, [{ productId: p._id, qty: 1 }]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(p._id)).toBe(0);
  });
});

describe('Payments and credit', () => {
  test('payments must add up to the invoice total', async () => {
    const p = await mkProduct(shop.ownerToken);
    const res = await bill(shop.ownerToken, [{ productId: p._id, qty: 1 }], { payments: [{ mode: 'CASH', amountPaise: 100 }] });
    expect(res.status).toBe(400);
    expect(await stockOf(p._id)).toBe(50);
  });

  test('credit needs a saved customer; part-credit tracks balance, settlement and customer dues', async () => {
    const p = await mkProduct(shop.ownerToken);
    const items = [{ productId: p._id, qty: 2 }]; // total 23600

    const noCustomer = await bill(shop.ownerToken, items, { payments: [{ mode: 'CREDIT' }] });
    expect(noCustomer.status).toBe(400);

    const customer = (await post('/customers', shop.cashierToken, { name: 'Ramesh Patil', phone: '9876543210' })).body.data;
    const sale = await bill(shop.cashierToken, items, {
      customerId: customer._id,
      payments: [
        { mode: 'CASH', amountPaise: 10000 },
        { mode: 'CREDIT', amountPaise: 13600 },
      ],
    });
    expect(sale.status).toBe(201);
    expect(sale.body.data).toMatchObject({ amountPaidPaise: 10000, balanceDuePaise: 13600, paymentStatus: 'PARTIAL' });
    expect((await get(`/customers/${customer._id}`, shop.ownerToken)).body.data.outstandingPaise).toBe(13600);

    const id = sale.body.data._id;
    const part = await post(`/invoices/${id}/payments`, shop.cashierToken, { mode: 'UPI', amountPaise: 5000 });
    expect(part.body.data).toMatchObject({ balanceDuePaise: 8600, paymentStatus: 'PARTIAL' });

    expect((await post(`/invoices/${id}/payments`, shop.cashierToken, { mode: 'CASH', amountPaise: 9000 })).status).toBe(409);

    const rest = await post(`/invoices/${id}/payments`, shop.cashierToken, { mode: 'CASH', amountPaise: 8600 });
    expect(rest.body.data).toMatchObject({ balanceDuePaise: 0, paymentStatus: 'PAID' });
    expect((await get(`/customers/${customer._id}`, shop.ownerToken)).body.data.outstandingPaise).toBe(0);
  });
});

describe('Roles', () => {
  test('cashier can bill but never sees cost, and cannot override the price', async () => {
    const p = await mkProduct(shop.ownerToken);

    const asCashier = await bill(shop.cashierToken, [{ productId: p._id, qty: 2 }]);
    expect(asCashier.status).toBe(201);
    expect(asCashier.body.data.items[0].costPaise).toBeUndefined();

    const asOwner = await get(`/invoices/${asCashier.body.data._id}`, shop.ownerToken);
    expect(asOwner.body.data.items[0].costPaise).toBe(10000); // 2 x ₹50

    const override = [{ productId: p._id, qty: 1, unitPricePaise: 9000 }];
    expect((await bill(shop.cashierToken, override)).status).toBe(403);
    expect((await bill(shop.managerToken, override)).status).toBe(201);
  });

  test('selling above MRP is rejected', async () => {
    const p = await mkProduct(shop.ownerToken, { sellingPricePaise: 10000, mrpPaise: 10000, priceIncludesGst: false });
    // 10000 + 18% = 11800 per unit, above the 10000 MRP
    const res = await bill(shop.ownerToken, [{ productId: p._id, qty: 1 }]);
    expect(res.status).toBe(400);
  });
});

describe('Batch-tracked products (FEFO)', () => {
  test('earliest expiry first, expired batches skipped, cost taken from each batch', async () => {
    const p = await mkProduct(shop.ownerToken, { trackBatches: true, openingStock: 0 });
    const addBatch = (batchNo, expiryDate, qty, purchasePricePaise) =>
      post(`/products/${p._id}/batches`, shop.ownerToken, { batchNo, expiryDate, qty, purchasePricePaise });

    await addBatch('EXPIRED', '2020-01-01', 5, 3000);
    await addBatch('B-LATE', '2031-01-31', 10, 4500);
    await addBatch('A-EARLY', '2030-06-30', 2, 4000);

    const res = await bill(shop.ownerToken, [{ productId: p._id, qty: 4 }]);
    expect(res.status).toBe(201);
    const [item] = res.body.data.items;
    expect(item.batches.map((b) => [b.batchNo, b.qty])).toEqual([
      ['A-EARLY', 2],
      ['B-LATE', 2],
    ]);
    expect(item.costPaise).toBe(2 * 4000 + 2 * 4500);

    // 13 units remain in total, but only 8 are unexpired.
    expect(await stockOf(p._id)).toBe(13);
    const tooMany = await bill(shop.ownerToken, [{ productId: p._id, qty: 9 }]);
    expect(tooMany.status).toBe(409);
  });
});