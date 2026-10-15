import 'server-only';
import type { ClientSession, Filter, ObjectId } from 'mongodb';
import { globalCollection } from '@/lib/db/client';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import { PHOTOS } from './gallery.indexes';
import type { PhotoDocument } from './gallery.types';

const scoped = (weddingId: WeddingId) => scopedCollection<PhotoDocument>(PHOTOS, weddingId);

/** One page of photos, newest first, after `cursor` (a photo id). */
export function listPhotos(
  weddingId: WeddingId,
  filter: Filter<PhotoDocument>,
  limit: number,
  cursor?: ObjectId,
) {
  return scoped(weddingId)
    .find({ ...filter, ...(cursor ? { _id: { $lt: cursor } } : {}) }, { sort: { _id: -1 }, limit })
    .toArray();
}

export function countPhotos(weddingId: WeddingId, filter: Filter<PhotoDocument> = {}) {
  return scoped(weddingId).countDocuments(filter);
}

/** Ready photos per album and how many are hidden. */
export function photoCounts(weddingId: WeddingId) {
  return scoped(weddingId)
    .aggregate<{ _id: ObjectId | null; count: number; hidden: number }>([
      { $match: { status: 'ready' } },
      {
        $group: {
          _id: '$albumEventId',
          count: { $sum: 1 },
          hidden: { $sum: { $cond: ['$hidden', 1, 0] } },
        },
      },
    ])
    .toArray();
}

export function findPhotos(weddingId: WeddingId, ids: ObjectId[], session?: ClientSession) {
  return scoped(weddingId)
    .find({ _id: { $in: ids } }, { session })
    .toArray();
}

export async function insertPhotos(weddingId: WeddingId, docs: Omit<PhotoDocument, 'weddingId'>[]) {
  await scoped(weddingId).insertMany(docs);
}

/** Mark a pending photo ready; `false` if it was already (so storage is only counted once). */
export async function markReady(
  weddingId: WeddingId,
  photoId: ObjectId,
  sizeBytes: number,
  now: Date,
  session?: ClientSession,
): Promise<boolean> {
  const result = await scoped(weddingId).updateOne(
    { _id: photoId, status: 'pending' },
    { $set: { status: 'ready', sizeBytes, readyAt: now, updatedAt: now } },
    { session },
  );
  return result.modifiedCount === 1;
}

export function updatePhotos(
  weddingId: WeddingId,
  ids: ObjectId[],
  set: Partial<Pick<PhotoDocument, 'hidden' | 'albumEventId'>>,
  now: Date,
) {
  return scoped(weddingId).updateMany(
    { _id: { $in: ids }, status: 'ready' },
    { $set: { ...set, updatedAt: now } },
  );
}

/** Delete these photos and return the ones that were deleted (for their files and storage). */
export async function deletePhotos(
  weddingId: WeddingId,
  ids: ObjectId[],
  session: ClientSession,
  onlyPending = false,
): Promise<PhotoDocument[]> {
  const docs = await scoped(weddingId)
    .find(
      { _id: { $in: ids }, ...(onlyPending ? { status: 'pending' as const } : {}) },
      { session },
    )
    .toArray();
  if (docs.length === 0) return [];
  await scoped(weddingId).deleteMany({ _id: { $in: docs.map((d) => d._id) } }, { session });
  return docs;
}

/** Photos of a deleted event go to "General" (database-design §8). */
export function clearAlbum(weddingId: WeddingId, eventId: ObjectId, session: ClientSession) {
  return scoped(weddingId).updateMany(
    { albumEventId: eventId },
    { $set: { albumEventId: null } },
    { session },
  );
}

/**
 * Uploads never confirmed, older than `before`, across weddings (the daily clean-up). The one
 * cross-wedding read: it returns only ids, so each wedding is then cleaned through its scope.
 */
export function findStalePendingPhotos(before: Date, limit: number) {
  return globalCollection<PhotoDocument>(PHOTOS)
    .find(
      { status: 'pending', createdAt: { $lt: before } },
      { projection: { _id: 1, weddingId: 1 }, limit },
    )
    .toArray();
}
