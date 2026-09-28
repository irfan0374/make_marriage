// Creates collections, validators and indexes declared by the modules. Idempotent; run after
// every deploy. Usage: pnpm db:indexes (reads .env.local).
import { closeMongoClient, getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { collectionSpecs } from '@/modules/collections';

async function main() {
  const db = getDb();
  console.log(`Applying ${collectionSpecs.length} collection spec(s) to "${db.databaseName}"...`);
  const results = await applyCollectionSpecs(db, collectionSpecs);
  for (const r of results) {
    console.log(
      `  ${r.collection}: ${r.created ? 'created, ' : ''}${r.indexes.length} index(es)` +
        `${r.validator ? ', validator applied' : ''}`,
    );
  }
  console.log('Done.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
