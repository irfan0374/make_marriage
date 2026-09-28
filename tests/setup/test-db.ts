import { randomBytes } from 'node:crypto';
import { afterAll, inject } from 'vitest';

// Runs before each integration test file: point the app at a throwaway database on the
// dedicated test cluster. The app's own env loading reads these values.

const dbName = `test_${inject('testRunId')}_${randomBytes(2).toString('hex')}`;
if (!dbName.startsWith('test_')) throw new Error(`Refusing to use non-test database ${dbName}`);

process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
process.env.MONGODB_DB_NAME = dbName;
process.env.MONGODB_MAX_POOL_SIZE = '2';
process.env.APP_URL ??= 'http://localhost:3000';

afterAll(async () => {
  const { getDb, closeMongoClient } = await import('@/lib/db/client');
  const db = getDb();
  if (db.databaseName.startsWith('test_')) await db.dropDatabase();
  await closeMongoClient();
});
