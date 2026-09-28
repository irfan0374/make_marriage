import 'server-only';
import type { ClientSession } from 'mongodb';
import { getMongoClient } from './client';

/**
 * Run `fn` in a multi-document transaction (database-design §9). The driver retries on
 * transient errors, so `fn` must be safe to run more than once. Pass `session` to every
 * repository call inside it.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = getMongoClient().startSession();
  try {
    return await session.withTransaction(fn, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } finally {
    await session.endSession();
  }
}
