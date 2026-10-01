import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { startTestApp, stopTestApp, createShop, bearer } from '../helpers/testApp.js';

let app;
let shop;
let other;
let invoiceId;

// Supertest parses PDFs as text by default, which corrupts the bytes. Collect a raw Buffer.
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const fetchPdf = (token, id, qs = '') =>
  request(app).get(`/api/v1/invoices/${id}/pdf${qs}`).set(bearer(token)).buffer(true).parse(binary);

beforeAll(async () => {
  app = await startTestApp();
  shop = await createShop(app, { gstRegistrationType: 'REGULAR', gstin: '27AAPFU0939F1ZV' });
  other = await createShop(app);

  const product = (
    await request(app)
      .post('/api/v1/products')
      .set(bearer(shop.ownerToken))
      .send({ name: 'Biscuits', sku: 'BIS-1', hsnCode: '1905', unit: 'PCS', sellingPricePaise: 10000, gstRate: 18, priceIncludesGst: false, openingStock: 20 })
  ).body.data;

  const inv = await request(app)
    .post('/api/v1/invoices')
    .set(bearer(shop.ownerToken))
    .send({ clientRequestId: randomUUID(), items: [{ productId: product._id, qty: 2 }], payments: [{ mode: 'CASH' }] });
  invoiceId = inv.body.data._id;
});
afterAll(stopTestApp);

describe('GET /invoices/:id/pdf', () => {
  test('A4 is the default and is shown inline', async () => {
    const res = await fetchPdf(shop.ownerToken, invoiceId);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="INV-\d{4}-\d{2}-\d{4}\.pdf"$/);
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(Number(res.headers['content-length'])).toBe(res.body.length);
  });

  test('download=true switches to an attachment', async () => {
    const res = await fetchPdf(shop.ownerToken, invoiceId, '?download=true');
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
  });

  test('thermal receipt uses a -receipt filename', async () => {
    const res = await fetchPdf(shop.ownerToken, invoiceId, '?format=thermal&widthMm=58');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/-receipt\.pdf"$/);
  });

  test('a cashier can print invoices', async () => {
    expect((await fetchPdf(shop.cashierToken, invoiceId)).status).toBe(200);
  });

  test("another shop cannot fetch it (404), and bad parameters are rejected (400)", async () => {
    expect((await fetchPdf(other.ownerToken, invoiceId)).status).toBe(404);
    expect((await fetchPdf(shop.ownerToken, invoiceId, '?format=docx')).status).toBe(400);
    expect((await fetchPdf(shop.ownerToken, invoiceId, '?format=thermal&widthMm=70')).status).toBe(400);
  });

  test('requires authentication', async () => {
    const res = await request(app).get(`/api/v1/invoices/${invoiceId}/pdf`);
    expect(res.status).toBe(401);
  });
});