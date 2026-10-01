import mongoose from 'mongoose';
import { env } from './env.js';
import '../models/index.js'; // registers every model before init()

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);

  // Create collections and build indexes up-front so the first transaction
  // never has to create a collection or wait on an index build.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  if (env.NODE_ENV !== 'test') console.log('MongoDB connected');
}

export async function disconnectDB() {
  await mongoose.disconnect();
}