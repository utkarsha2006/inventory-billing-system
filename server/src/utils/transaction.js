import mongoose from 'mongoose';

// Runs fn(session) inside a transaction and returns its result.
// NOTE: the driver may re-run `fn` on transient errors (e.g. write conflicts),
// so `fn` must have no side effects outside the database.
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}