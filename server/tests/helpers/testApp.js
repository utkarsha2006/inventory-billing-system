import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;
let seq = 0;

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

export async function startTestApp() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri('inventory_test');
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
  process.env.BCRYPT_ROUNDS = '4';
  process.env.CRON_SECRET = 'test-cron-secret-0123456789';

  // Import after env vars are set: config/env.js validates on import.
  const { connectDB } = await import('../../src/config/db.js');
  const app = (await import('../../src/app.js')).default;
  await connectDB();
  return app;
}

export async function stopTestApp() {
  await mongoose.disconnect();
  await replSet.stop();
}

// Registers a fresh shop; returns tokens for an owner, a manager and a cashier.
export async function createShop(app, shopOverrides = {}) {
  seq += 1;
  const tag = `${Date.now()}${seq}`;

  const reg = await request(app)
    .post('/api/v1/auth/register-shop')
    .send({
      shop: { name: `Shop ${tag}`, stateCode: '27', ...shopOverrides },
      owner: { name: 'Owner One', email: `owner.${tag}@example.com`, password: 'Passw0rd123' },
    });
  const ownerToken = reg.body.data.accessToken;

  const makeStaff = async (role) => {
    const email = `${role.toLowerCase()}.${tag}@example.com`;
    await request(app)
      .post('/api/v1/users')
      .set(bearer(ownerToken))
      .send({ name: `${role} User`, email, password: 'Passw0rd123', role });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Passw0rd123' });
    return login.body.data.accessToken;
  };

  return {
    ownerToken,
    managerToken: await makeStaff('MANAGER'),
    cashierToken: await makeStaff('CASHIER'),
  };
}