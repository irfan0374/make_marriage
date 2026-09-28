import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { TestProject } from 'vitest/node';

// Runs once per `vitest` run. Each test file gets its own database `test_<epoch>_<run>_<file>`
// (see test-db.ts). Only databases matching TEST_DB_PATTERN are ever dropped.

declare module 'vitest' {
  export interface ProvidedContext {
    testRunId: string;
  }
}

const TEST_DB_PATTERN = /^test_(\d{10})_[0-9a-f]{4}_[0-9a-f]{4}$/;
const STALE_AFTER_MS = 60 * 60 * 1000;

async function dropMatching(client: MongoClient, shouldDrop: (name: string) => boolean) {
  try {
    const { databases } = await client.db().admin().listDatabases({ nameOnly: true });
    for (const { name } of databases) {
      if (TEST_DB_PATTERN.test(name) && shouldDrop(name)) await client.db(name).dropDatabase();
    }
  } catch (error) {
    console.warn('[vitest] Could not clean up test databases:', (error as Error).message);
  }
}

export default async function setup(project: TestProject) {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) throw new Error('TEST_MONGODB_URI is required for integration tests.');

  const runId = `${Math.floor(Date.now() / 1000)}_${randomBytes(2).toString('hex')}`;
  project.provide('testRunId', runId);

  const client = new MongoClient(uri, { maxPoolSize: 2, serverSelectionTimeoutMS: 10_000 });
  // Leftovers from crashed runs.
  await dropMatching(client, (name) => {
    const epoch = Number(TEST_DB_PATTERN.exec(name)?.[1]) * 1000;
    return Date.now() - epoch > STALE_AFTER_MS;
  });

  return async () => {
    await dropMatching(client, (name) => name.startsWith(`test_${runId}_`));
    await client.close();
  };
}
