import mongoose from 'mongoose';
import { env } from './env.js';
import '../models/index.js'; // registers every model before init()

export async function connectDB() {
  // Safety net: tests must never touch a real database.
  if (env.NODE_ENV === 'test' && !/inventory_test/.test(env.MONGODB_URI)) {
    throw new Error('Refusing to run tests against a non-test database. Check for a static import that loads env.js too early.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 10, // a small pool: free Atlas clusters cap total connections
    serverSelectionTimeoutMS: 10_000, // fail fast with a clear error instead of hanging on a bad URI or blocked IP
  });

  // Create collections and build indexes up-front so the first transaction
  // never has to create a collection or wait on an index build.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  if (env.NODE_ENV !== 'test') console.log('MongoDB connected');
}

export async function disconnectDB() {
  await mongoose.disconnect();
}