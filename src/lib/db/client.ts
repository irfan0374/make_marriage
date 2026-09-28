import 'server-only';
import { MongoClient, type Collection, type Db, type Document } from 'mongodb';
import { APP_ID } from '@/config/app';
import { getEnv } from '@/lib/env';

// One client per function instance, reused across requests and across dev hot reloads.
// The driver connects lazily on the first operation.
const globalForMongo = globalThis as typeof globalThis & { __mongoClient?: MongoClient };

export function getMongoClient(): MongoClient {
  if (!globalForMongo.__mongoClient) {
    const env = getEnv();
    globalForMongo.__mongoClient = new MongoClient(env.MONGODB_URI, {
      appName: APP_ID,
      // Small pool per serverless instance: many instances share Atlas's connection limit.
      maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
      // Close idle connections so paused or scaled-down instances don't hold them.
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5_000,
    });
  }
  return globalForMongo.__mongoClient;
}

export function getDb(): Db {
  return getMongoClient().db(getEnv().MONGODB_DB_NAME);
}

/**
 * Raw access for GLOBAL collections only (users, sessions, rateLimits, ...).
 * Tenant collections must go through `scopedCollection` in `./tenant`.
 */
export function globalCollection<T extends Document>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}

/** Close the shared client (scripts and tests). */
export async function closeMongoClient(): Promise<void> {
  const client = globalForMongo.__mongoClient;
  globalForMongo.__mongoClient = undefined;
  await client?.close();
}
