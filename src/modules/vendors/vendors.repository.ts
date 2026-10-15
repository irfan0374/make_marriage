import 'server-only';
import type { ClientSession, Filter, ObjectId, UpdateFilter } from 'mongodb';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import { NAME_COLLATION, VENDORS } from './vendors.indexes';
import type { VendorDocument } from './vendors.types';

const scoped = (weddingId: WeddingId) => scopedCollection<VendorDocument>(VENDORS, weddingId);

const SORTS = {
  name: { name: 1, _id: 1 },
  '-createdAt': { createdAt: -1, _id: -1 },
} as const;

export function listVendors(
  weddingId: WeddingId,
  filter: Filter<VendorDocument>,
  sort: keyof typeof SORTS,
) {
  return scoped(weddingId).find(filter, { sort: SORTS[sort], collation: NAME_COLLATION }).toArray();
}

export function countVendors(weddingId: WeddingId, session?: ClientSession) {
  return scoped(weddingId).countDocuments({}, { session });
}

export function findVendor(weddingId: WeddingId, vendorId: ObjectId, session?: ClientSession) {
  return scoped(weddingId).findOne({ _id: vendorId }, { session });
}

export async function insertVendor(
  weddingId: WeddingId,
  doc: Omit<VendorDocument, 'weddingId'>,
  session: ClientSession,
): Promise<VendorDocument> {
  await scoped(weddingId).insertOne(doc, { session });
  return { ...doc, weddingId };
}

export function updateVendor(
  weddingId: WeddingId,
  vendorId: ObjectId,
  update: UpdateFilter<VendorDocument>,
  session?: ClientSession,
) {
  return scoped(weddingId).findOneAndUpdate({ _id: vendorId }, update, {
    returnDocument: 'after',
    session,
  });
}

/** Deletes the vendor and returns it (for its files), or `null` if there was none. */
export async function deleteVendor(
  weddingId: WeddingId,
  vendorId: ObjectId,
  session: ClientSession,
): Promise<VendorDocument | null> {
  const doc = await scoped(weddingId).findOne({ _id: vendorId }, { session });
  if (!doc) return null;
  const result = await scoped(weddingId).deleteOne({ _id: vendorId }, { session });
  return result.deletedCount > 0 ? doc : null;
}

/** Take a deleted event off every vendor (database-design §8). */
export async function pullEvent(weddingId: WeddingId, eventId: ObjectId, session: ClientSession) {
  await scoped(weddingId).updateMany(
    { eventIds: eventId },
    { $pull: { eventIds: eventId } },
    { session },
  );
}

/** Names of these vendors (those that still exist), by id. */
export function findVendorNames(
  weddingId: WeddingId,
  vendorIds: ObjectId[],
  session?: ClientSession,
) {
  return scoped(weddingId)
    .find({ _id: { $in: vendorIds } }, { projection: { name: 1 }, session })
    .toArray();
}
