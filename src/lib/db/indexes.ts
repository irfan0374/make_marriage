import 'server-only';
import type { Db, Document, IndexDescription } from 'mongodb';

/** Declared in each module's `<module>.indexes.ts`, applied by `scripts/create-indexes.ts`. */
export interface CollectionSpec {
  collection: string;
  indexes: IndexDescription[];
  /** Light `$jsonSchema` safety net (database-design §10). */
  validator?: Document;
}

export interface ApplyResult {
  collection: string;
  created: boolean;
  indexes: string[];
  validator: boolean;
}

/** Idempotent: creates missing collections, (re)applies validators, creates missing indexes. */
export async function applyCollectionSpecs(
  db: Db,
  specs: CollectionSpec[],
): Promise<ApplyResult[]> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  const results: ApplyResult[] = [];

  for (const spec of specs) {
    const created = !existing.has(spec.collection);
    if (created) await db.createCollection(spec.collection);

    if (spec.validator) {
      await db.command({
        collMod: spec.collection,
        validator: spec.validator,
        validationLevel: 'moderate',
        validationAction: 'error',
      });
    }

    const indexes =
      spec.indexes.length > 0
        ? await db.collection(spec.collection).createIndexes(spec.indexes)
        : [];
    results.push({
      collection: spec.collection,
      created,
      indexes,
      validator: Boolean(spec.validator),
    });
  }
  return results;
}
