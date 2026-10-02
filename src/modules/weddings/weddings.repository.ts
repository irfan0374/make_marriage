import 'server-only';
import { MongoServerError, type ClientSession, type ObjectId } from 'mongodb';
import { globalCollection } from '@/lib/db/client';
import type { WeddingId } from '@/lib/ids';
import { WEDDINGS } from './weddings.indexes';
import type { WeddingDocument } from './weddings.types';

// `weddings` is the tenant root: a wedding's own `_id` is its `weddingId`, so every per-wedding
// function filters on `_id`. It never holds secrets, but the gallery token stays server-side.

const weddings = () => globalCollection<WeddingDocument>(WEDDINGS);

/** The suggested website address was taken between the availability check and the insert. */
export class DuplicateSlugError extends Error {}

export async function insertWedding(doc: WeddingDocument, session: ClientSession): Promise<void> {
  try {
    await weddings().insertOne(doc, { session });
  } catch (error) {
    if (
      error instanceof MongoServerError &&
      error.code === 11000 &&
      Object.keys(error.keyPattern ?? {}).includes('website.slug')
    ) {
      throw new DuplicateSlugError();
    }
    throw error;
  }
}

export function findWedding(weddingId: WeddingId) {
  return weddings().findOne({ _id: weddingId });
}

/** The wedding's editable details (api-spec §6.3). */
export type WeddingDetails = Pick<
  WeddingDocument,
  'brideName' | 'groomName' | 'weddingDate' | 'city' | 'venue' | 'timezone' | 'sidesEnabled'
>;

/**
 * Save changed details and return the updated wedding, or `null` if it's archived (or gone) by
 * the time of the write: matching on `status` too means a wedding archived a moment ago is never
 * changed.
 */
export function updateWeddingDetails(
  weddingId: WeddingId,
  changes: Partial<WeddingDetails>,
  now: Date,
) {
  return weddings().findOneAndUpdate(
    { _id: weddingId, status: 'active' },
    { $set: { ...changes, updatedAt: now } },
    { returnDocument: 'after', includeResultMetadata: false },
  );
}

/** Summaries for the user's wedding list. Ids come from the user's own memberships. */
export function findWeddingSummaries(weddingIds: ObjectId[]) {
  return weddings()
    .find(
      { _id: { $in: weddingIds } },
      {
        projection: {
          brideName: 1,
          groomName: 1,
          weddingDate: 1,
          city: 1,
          status: 1,
        },
      },
    )
    .toArray();
}

/** Website addresses in use that are `base` or `base-N`, to pick the next free one. */
export async function findSlugsLike(base: string): Promise<string[]> {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const docs = await weddings()
    .find(
      { 'website.slug': { $regex: `^${escaped}(-\\d+)?$` } },
      { projection: { 'website.slug': 1 } },
    )
    .toArray();
  return docs.map((d) => d.website.slug).filter((s): s is string => typeof s === 'string');
}
