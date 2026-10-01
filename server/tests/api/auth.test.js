import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;
let app;

beforeAll(async () => {
  // Transactions need a replica set, so use an in-memory one.
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri('inventory_test');
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
  process.env.BCRYPT_ROUNDS = '4';

  // Import after env vars are set: config/env.js validates on import.
  const { connectDB } = await import('../../src/config/db.js');
  app = (await import('../../src/app.js')).default;
  await connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

const register = (suffix, overrides = {}) =>
  request(app)
    .post('/api/v1/auth/register-shop')
    .send({
      shop: { name: `Shop ${suffix}`, stateCode: '27', ...overrides.shop },
      owner: {
        name: 'Ravi Sharma',
        email: `owner.${suffix}@example.com`,
        password: 'Passw0rd123',
        ...overrides.owner,
      },
    });

const cookieOf = (res) => res.headers['set-cookie'][0].split(';')[0];
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe('Auth', () => {
  test('registers a shop, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await register('a', {
      shop: { gstRegistrationType: 'REGULAR', gstin: '27AAPFU0939F1ZV' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.role).toBe('OWNER');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
  });

  test('rejects a GSTIN with a bad check digit', async () => {
    const res = await register('b', {
      shop: { gstRegistrationType: 'REGULAR', gstin: '27AAPFU0939F1ZX' },
    });
    expect(res.status).toBe(400);
  });

  test('rejects a duplicate email with 409', async () => {
    await register('c');
    const res = await register('c');
    expect(res.status).toBe(409);
  });

  test('login fails with a wrong password and works with the right one', async () => {
    await register('d');
    const bad = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner.d@example.com', password: 'WrongPass1' });
    expect(bad.status).toBe(401);

    const good = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner.d@example.com', password: 'Passw0rd123' });
    expect(good.status).toBe(200);
  });

  test('/auth/me requires a valid token', async () => {
    const noToken = await request(app).get('/api/v1/auth/me');
    expect(noToken.status).toBe(401);

    const reg = await register('e');
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(reg.body.data.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.shop.name).toBe('Shop e');
  });

  test('refresh rotates the token; replaying the old one revokes the whole family', async () => {
    const reg = await register('f');
    const oldCookie = cookieOf(reg);

    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(rotated.status).toBe(200);
    const newCookie = cookieOf(rotated);

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(replay.status).toBe(401);

    // The legitimate new token is now dead too.
    const afterReplay = await request(app).post('/api/v1/auth/refresh').set('Cookie', newCookie);
    expect(afterReplay.status).toBe(401);
  });
});

describe('RBAC', () => {
  test('owner can create a cashier; cashier cannot manage users', async () => {
    const reg = await register('g');
    const ownerToken = reg.body.data.accessToken;

    const created = await request(app)
      .post('/api/v1/users')
      .set(bearer(ownerToken))
      .send({ name: 'Anil Kumar', email: 'anil.g@example.com', password: 'Passw0rd123', role: 'CASHIER' });
    expect(created.status).toBe(201);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'anil.g@example.com', password: 'Passw0rd123' });
    const cashierToken = login.body.data.accessToken;

    const denied = await request(app).get('/api/v1/users').set(bearer(cashierToken));
    expect(denied.status).toBe(403);

    const shopRead = await request(app).get('/api/v1/shop').set(bearer(cashierToken));
    expect(shopRead.status).toBe(200);

    const shopWrite = await request(app)
      .patch('/api/v1/shop')
      .set(bearer(cashierToken))
      .send({ name: 'Hacked' });
    expect(shopWrite.status).toBe(403);
  });

  test('a deactivated user loses access immediately', async () => {
    const reg = await register('h');
    const ownerToken = reg.body.data.accessToken;

    const created = await request(app)
      .post('/api/v1/users')
      .set(bearer(ownerToken))
      .send({ name: 'Meena Iyer', email: 'meena.h@example.com', password: 'Passw0rd123', role: 'MANAGER' });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'meena.h@example.com', password: 'Passw0rd123' });
    const managerToken = login.body.data.accessToken;

    await request(app)
      .patch(`/api/v1/users/${created.body.data._id}`)
      .set(bearer(ownerToken))
      .send({ isActive: false });

    const res = await request(app).get('/api/v1/auth/me').set(bearer(managerToken));
    expect(res.status).toBe(401);
  });
});