import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { startTestApp, stopTestApp, createShop, bearer } from '../helpers/testApp.js';

let app;
let shop;
let plain;
let n = 0;
const next = () => (n += 1);

const post = (path, token, body) => request(app).post(`/api/v1${path}`).set(bearer(token)).send(body);
const get = (path, token) => request(app).get(`/api/v1${path}`).set(bearer(token));
const phone = () => `9${String(100000000 + next()).slice(0, 9)}`;

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

// ₹100 exclusive of 18% GST, cost ₹50, stock 50
const mkProduct = async (token, o = {}) =>
  (
    await post('/products', token, {
      name: `Item ${next()}`,
      sku: `R-${next()}`,
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

const sell = (token, items, o = {}) =>
  post('/invoices', token, { clientRequestId: randomUUID(), items, payments: [{ mode: 'CASH' }], ...o });

const giveBack = (token, invoiceId, items, o = {}) =>
  post(`/invoices/${invoiceId}/returns`, token, {
    clientRequestId: randomUUID(),
    items,
    refundMode: 'CASH',
    reason: 'Customer changed mind',
    ...o,
  });

const stockOf = async (id) => (await get(`/products/${id}`, shop.ownerToken)).body.data.stockQty;

beforeAll(async () => {
  app = await startTestApp();
  shop = await createShop(app, { gstRegistrationType: 'REGULAR', gstin: '27AAPFU0939F1ZV' });
  plain = await createShop(app);
});
afterAll(stopTestApp);

describe('Credit note maths and stock', () => {
  test('partial returns add up exactly to the original sale, restock, and cap at the quantity sold', async () => {
    const p = await mkProduct(shop.ownerToken);
    const inv = (await sell(shop.ownerToken, [{ productId: p._id, qty: 3 }])).body.data;
    expect(inv.totals.grandTotalPaise).toBe(35400);
    const itemId = inv.items[0]._id;

    const first = await giveBack(shop.managerToken, inv._id, [{ invoiceItemId: itemId, qty: 1 }]);
    expect(first.status).toBe(201);
    expect(first.body.data.creditNoteNo).toMatch(/^CN\/\d{4}-\d{2}\/\d{4}$/);
    expect(first.body.data.totals).toMatchObject({ taxablePaise: 10000, cgstPaise: 900, sgstPaise: 900, grandTotalPaise: 11800 });
    expect(first.body.data).toMatchObject({ refundPaise: 11800, adjustedAgainstDuePaise: 0, taxReductionBarred: false, invoiceNo: inv.invoiceNo });
    expect(await stockOf(p._id)).toBe(48);

    const rest = await giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: itemId, qty: 2 }]);
    expect(rest.body.data.totals).toMatchObject({ taxablePaise: 20000, cgstPaise: 1800, sgstPaise: 1800, grandTotalPaise: 23600 });
    expect(11800 + 23600).toBe(inv.totals.grandTotalPaise);
    expect(await stockOf(p._id)).toBe(50);

    expect((await giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: itemId, qty: 1 }])).status).toBe(409);
    expect((await get(`/invoices/${inv._id}`, shop.ownerToken)).body.data.items[0].returnedQty).toBe(3);
  });

  test('restock:false leaves stock alone and reverses no cost', async () => {
    const p = await mkProduct(shop.ownerToken);
    const inv = (await sell(shop.ownerToken, [{ productId: p._id, qty: 2 }])).body.data;
    const res = await giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: inv.items[0]._id, qty: 1, restock: false }]);
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].costPaise).toBe(0);
    expect(await stockOf(p._id)).toBe(48);
  });

  test('a deactivated product can still be returned and restocked', async () => {
    const p = await mkProduct(shop.ownerToken);
    const inv = (await sell(shop.ownerToken, [{ productId: p._id, qty: 1 }])).body.data;
    await request(app).delete(`/api/v1/products/${p._id}`).set(bearer(shop.ownerToken));

    expect((await giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: inv.items[0]._id, qty: 1 }])).status).toBe(201);
    expect(await stockOf(p._id)).toBe(50);
  });

  test('returned goods go back to the batches they were sold from', async () => {
    const p = await mkProduct(shop.ownerToken, { trackBatches: true, openingStock: 0 });
    const addBatch = (batchNo, expiryDate, qty, purchasePricePaise) =>
      post(`/products/${p._id}/batches`, shop.ownerToken, { batchNo, expiryDate, qty, purchasePricePaise });
    await addBatch('A', '2030-06-30', 2, 4000);
    await addBatch('B', '2031-01-31', 10, 4500);

    const inv = (await sell(shop.ownerToken, [{ productId: p._id, qty: 4 }])).body.data; // A: 2, B: 2
    const res = await giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: inv.items[0]._id, qty: 3 }]);
    expect(res.status).toBe(201);

    const batches = (await get(`/products/${p._id}/batches`, shop.ownerToken)).body.data;
    expect(batches.map((b) => [b.batchNo, b.qtyRemaining])).toEqual([['A', 2], ['B', 9]]);
    expect(await stockOf(p._id)).toBe(11);
  });

  test('a return on a Bill of Supply carries no tax', async () => {
    const p = await mkProduct(plain.ownerToken);
    const inv = (await sell(plain.ownerToken, [{ productId: p._id, qty: 1 }])).body.data;
    const res = await giveBack(plain.ownerToken, inv._id, [{ invoiceItemId: inv.items[0]._id, qty: 1 }]);
    expect(res.body.data.originalDocumentType).toBe('BILL_OF_SUPPLY');
    expect(res.body.data.totals).toMatchObject({ taxablePaise: 10000, cgstPaise: 0, sgstPaise: 0, grandTotalPaise: 10000 });
  });
});

describe('Refunds, credit and store credit', () => {
  const makeCustomer = async () => (await post('/customers', shop.cashierToken, { name: 'Ramesh Patil', phone: phone() })).body.data;

  test('a return first cancels the unpaid credit balance', async () => {
    const p = await mkProduct(shop.ownerToken);
    const customer = await makeCustomer();
    const inv = (await sell(shop.ownerToken, [{ productId: p._id, qty: 2 }], { customerId: customer._id, payments: [{ mode: 'CREDIT' }] })).body.data;
    expect(inv.balanceDuePaise).toBe(23600);
    const itemId = inv.items[0]._id;

    const one = await giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: itemId, qty: 1 }]);
    expect(one.body.data).toMatchObject({ adjustedAgainstDuePaise: 11800, refundPaise: 0 });
    let after = (await get(`/invoices/${inv._id}`, shop.ownerToken)).body.data;
    expect(after).toMatchObject({ balanceDuePaise: 11800, paymentStatus: 'PARTIAL' });
    expect((await get(`/customers/${customer._id}`, shop.ownerToken)).body.data.outstandingPaise).toBe(11800);

    await giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: itemId, qty: 1 }]);
    after = (await get(`/invoices/${inv._id}`, shop.ownerToken)).body.data;
    expect(after).toMatchObject({ balanceDuePaise: 0, paymentStatus: 'PAID' });
    expect((await get(`/customers/${customer._id}`, shop.ownerToken)).body.data.outstandingPaise).toBe(0);
  });

  test('store credit goes on the customer account, and needs a saved customer', async () => {
    const p = await mkProduct(shop.ownerToken);
    const customer = await makeCustomer();
    const paid = (await sell(shop.ownerToken, [{ productId: p._id, qty: 1 }], { customerId: customer._id })).body.data;

    const res = await giveBack(shop.ownerToken, paid._id, [{ invoiceItemId: paid.items[0]._id, qty: 1 }], { refundMode: 'CREDIT_ADJUST' });
    expect(res.body.data).toMatchObject({ refundPaise: 11800, refundMode: 'CREDIT_ADJUST' });
    expect((await get(`/customers/${customer._id}`, shop.ownerToken)).body.data.outstandingPaise).toBe(-11800);

    const walkIn = (await sell(shop.ownerToken, [{ productId: p._id, qty: 1 }])).body.data;
    const bad = await giveBack(shop.ownerToken, walkIn._id, [{ invoiceItemId: walkIn.items[0]._id, qty: 1 }], { refundMode: 'CREDIT_ADJUST' });
    expect(bad.status).toBe(400);
  });
});

describe('Safety', () => {
  test('two simultaneous returns of the same unit: exactly one wins and stock is restored once', async () => {
    const p = await mkProduct(shop.ownerToken);
    const inv = (await sell(shop.ownerToken, [{ productId: p._id, qty: 1 }])).body.data;
    const attempt = () => giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: inv.items[0]._id, qty: 1 }]);

    const results = await Promise.all([attempt(), attempt()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(p._id)).toBe(50);
  });

  test('the same clientRequestId replays the original credit note', async () => {
    const p = await mkProduct(shop.ownerToken);
    const inv = (await sell(shop.ownerToken, [{ productId: p._id, qty: 2 }])).body.data;
    const body = {
      clientRequestId: randomUUID(),
      items: [{ invoiceItemId: inv.items[0]._id, qty: 1 }],
      refundMode: 'CASH',
      reason: 'Damaged on delivery',
    };

    const a = await post(`/invoices/${inv._id}/returns`, shop.ownerToken, body);
    const b = await post(`/invoices/${inv._id}/returns`, shop.ownerToken, body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.data._id).toBe(a.body.data._id);
    expect(b.body.meta.idempotentReplay).toBe(true);
    expect(await stockOf(p._id)).toBe(49);
  });

  test('roles, ownership and bad input', async () => {
    const p = await mkProduct(shop.ownerToken);
    const inv = (await sell(shop.ownerToken, [{ productId: p._id, qty: 1 }])).body.data;
    const item = [{ invoiceItemId: inv.items[0]._id, qty: 1 }];

    expect((await giveBack(shop.cashierToken, inv._id, item)).status).toBe(403);
    expect((await giveBack(plain.ownerToken, inv._id, item)).status).toBe(404); // another shop's invoice
    expect((await giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: '507f1f77bcf86cd799439011', qty: 1 }])).status).toBe(400);
    expect((await giveBack(shop.ownerToken, inv._id, item, { reason: '' })).status).toBe(400);
    expect(await stockOf(p._id)).toBe(49);
  });
});

describe('Credit note documents', () => {
  test('list, fetch and PDF', async () => {
    const p = await mkProduct(shop.ownerToken);
    const inv = (await sell(shop.ownerToken, [{ productId: p._id, qty: 1 }])).body.data;
    const cn = (await giveBack(shop.ownerToken, inv._id, [{ invoiceItemId: inv.items[0]._id, qty: 1 }])).body.data;

    const list = await get(`/credit-notes?invoiceId=${inv._id}`, shop.managerToken);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].creditNoteNo).toBe(cn.creditNoteNo);
    expect((await get(`/credit-notes/${cn._id}`, shop.ownerToken)).body.data.items[0].qty).toBe(1);
    expect((await get('/credit-notes', shop.cashierToken)).status).toBe(403);

    for (const qs of ['', '?format=thermal']) {
      const pdf = await request(app).get(`/api/v1/credit-notes/${cn._id}/pdf${qs}`).set(bearer(shop.ownerToken)).buffer(true).parse(binary);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
      expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.headers['content-disposition']).toMatch(/CN-\d{4}-\d{2}-\d{4}/);
    }
  });
});