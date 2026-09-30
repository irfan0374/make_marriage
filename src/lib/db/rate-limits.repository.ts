import 'server-only';
import type { CollectionSpec } from './indexes';
import { globalCollection } from './client';

// Fixed-window counters (database-design §6.4). Global collection, shared by every module.

interface RateLimitDocument {
  key: string;
  windowStart: Date;
  count: number;
  expiresAt: Date;
}

const COLLECTION = 'rateLimits';

export const rateLimitsSpec: CollectionSpec = {
  collection: COLLECTION,
  indexes: [
    { key: { key: 1, windowStart: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ],
};

/** Atomically count one hit in the current window and return the new total. */
export async function incrementWindow(key: string, windowMs: number, now = new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs + 60_000);
  const doc = await globalCollection<RateLimitDocument>(COLLECTION).findOneAndUpdate(
    { key, windowStart },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: false },
  );
  return { count: doc?.count ?? 1, resetAt: expiresAt.getTime() - 60_000 };
}
