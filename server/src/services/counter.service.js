import { Counter } from '../models/index.js';

// Call BEFORE the transaction. Creating the counter inside it would let two concurrent first
// invoices race on the unique index. Duplicate-key errors here are harmless: it already exists.
export async function ensureCounter(shopId, key) {
  try {
    await Counter.updateOne({ shopId, key }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}

// Call INSIDE the transaction: if it aborts, the increment rolls back, so numbers stay gapless.
export async function nextSequence(session, shopId, key) {
  const counter = await Counter.findOneAndUpdate({ shopId, key }, { $inc: { seq: 1 } }, { new: true, session });
  if (!counter) throw new Error(`Counter "${key}" missing: call ensureCounter() first`);
  return counter.seq;
}