import request from 'supertest';
import { startTestApp, stopTestApp, createShop, bearer } from '../helpers/testApp.js';
import { setMailTransport } from '../../src/services/email.service.js';

let app;
let shop;
let runLowStockAlerts;
let sent = [];

const post = (path, token, body) => request(app).post(`/api/v1${path}`).set(bearer(token)).send(body);
const ymdInDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const goodTransport = { sendMail: async (msg) => { sent.push(msg); return {}; } };

beforeAll(async () => {
  app = await startTestApp();
  ({ runLowStockAlerts } = await import('../../src/jobs/lowStockAlert.job.js'));
  shop = await createShop(app);
  await createShop(app); // a second shop with nothing to report

  // 2 left, reorder at 5, and the name tries to inject HTML
  await post('/products', shop.ownerToken, {
    name: 'Tea <b>Gold</b>',
    sku: 'TEA-1',
    unit: 'PCS',
    sellingPricePaise: 10000,
    gstRate: 5,
    openingStock: 2,
    reorderLevel: 5,
  });
  await post('/products', shop.ownerToken, {
    name: 'Plenty',
    sku: 'PL-1',
    unit: 'PCS',
    sellingPricePaise: 10000,
    gstRate: 5,
    openingStock: 50,
    reorderLevel: 5,
  });

  const milk = (
    await post('/products', shop.ownerToken, {
      name: 'Milk',
      sku: 'MILK-1',
      unit: 'PCS',
      sellingPricePaise: 5000,
      gstRate: 5,
      trackBatches: true,
    })
  ).body.data;
  await post(`/products/${milk._id}/batches`, shop.ownerToken, { batchNo: 'M-OLD', expiryDate: '2020-01-01', qty: 2 });
  await post(`/products/${milk._id}/batches`, shop.ownerToken, { batchNo: 'M-SOON', expiryDate: ymdInDays(10), qty: 5 });
});
afterAll(stopTestApp);

describe('GET /alerts (dashboard)', () => {
  test('lists low stock plus expired and soon-to-expire batches; cashiers can read it', async () => {
    const res = await request(app).get('/api/v1/alerts').set(bearer(shop.cashierToken));
    expect(res.status).toBe(200);

    const d = res.body.data;
    expect(d.lowStockCount).toBe(1);
    expect(d.lowStock[0]).toMatchObject({ sku: 'TEA-1', stockQty: 2, reorderLevel: 5 });
    expect(d.expiringCount).toBe(2);
    expect(d.expiring.map((b) => [b.batchNo, b.expired])).toEqual([['M-OLD', true], ['M-SOON', false]]);
    expect(d.hasAlerts).toBe(true);
  });

  test('requires authentication', async () => {
    expect((await request(app).get('/api/v1/alerts')).status).toBe(401);
  });
});

describe('Daily alert email', () => {
  test('emails the owner once per day, escapes product names, and skips shops with nothing to report', async () => {
    setMailTransport(goodTransport);

    const first = await runLowStockAlerts();
    expect(first).toMatchObject({ shops: 2, sent: 1, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toMatch(/^owner\./);
    expect(sent[0].subject).toMatch(/1 low, 2 expiring/);
    expect(sent[0].text).toContain('Tea <b>Gold</b>');
    expect(sent[0].html).toContain('Tea &lt;b&gt;Gold&lt;/b&gt;');
    expect(sent[0].html).not.toContain('<b>Gold</b>');

    // A second trigger the same day (cron plus an external scheduler) must not send again.
    const second = await runLowStockAlerts();
    expect(second.sent).toBe(0);
    expect(sent).toHaveLength(1);

    // The next day it sends again.
    const tomorrow = await runLowStockAlerts({ now: new Date(Date.now() + 86_400_000) });
    expect(tomorrow.sent).toBe(1);
    expect(sent).toHaveLength(2);
  });

  test('a failed send releases the claim, so the next run retries it', async () => {
    sent = [];
    const day = new Date(Date.now() + 5 * 86_400_000);
    setMailTransport({ sendMail: async () => { throw new Error('SMTP down'); } });

    const failed = await runLowStockAlerts({ now: day });
    expect(failed).toMatchObject({ sent: 0, failed: 1 });

    setMailTransport(goodTransport);
    const retry = await runLowStockAlerts({ now: day });
    expect(retry.sent).toBe(1);
    expect(sent).toHaveLength(1);
  });
});

describe('POST /jobs/low-stock-alerts', () => {
  const run = (secret) => {
    const req = request(app).post('/api/v1/jobs/low-stock-alerts');
    return secret ? req.set('x-cron-secret', secret) : req;
  };

  test('rejects a missing or wrong secret', async () => {
    expect((await run()).status).toBe(401);
    expect((await run('wrong-secret-wrong-secret')).status).toBe(401);
  });

  test('runs the job with the right secret', async () => {
    const res = await run('test-cron-secret-0123456789');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ shops: 2, failed: 0 });
  });
});