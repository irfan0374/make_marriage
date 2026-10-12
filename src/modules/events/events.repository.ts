import 'server-only';
import { ObjectId } from 'mongodb';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import { EVENTS } from './events.indexes';
import type { CreateEventInput, EventDocument, UpdateEventInput } from './events.types';

const scoped = (weddingId: WeddingId) => scopedCollection<EventDocument>(EVENTS, weddingId);

/** In display order; `_id` breaks ties if two events were added at the same moment. */
export function listEvents(weddingId: WeddingId) {
  return scoped(weddingId)
    .find({}, { sort: { order: 1, _id: 1 } })
    .toArray();
}

export function countEvents(weddingId: WeddingId) {
  return scoped(weddingId).countDocuments();
}

export function findEvent(weddingId: WeddingId, eventId: ObjectId) {
  return scoped(weddingId).findOne({ _id: eventId });
}

/** Add events after the existing ones, keeping their order. */
export async function insertEvents(
  weddingId: WeddingId,
  inputs: CreateEventInput[],
  now: Date,
): Promise<EventDocument[]> {
  const last = await scoped(weddingId).findOne(
    {},
    { sort: { order: -1 }, projection: { order: 1 } },
  );
  const start = last ? last.order + 1 : 0;
  const docs = inputs.map((input, index) => ({
    _id: new ObjectId(),
    ...input,
    order: start + index,
    schemaVersion: 1 as const,
    createdAt: now,
    updatedAt: now,
  }));
  await scoped(weddingId).insertMany(docs);
  return docs.map((doc) => ({ ...doc, weddingId }));
}

export function updateEvent(
  weddingId: WeddingId,
  eventId: ObjectId,
  changes: UpdateEventInput,
  now: Date,
) {
  return scoped(weddingId).findOneAndUpdate(
    { _id: eventId },
    { $set: { ...changes, updatedAt: now } },
    { returnDocument: 'after' },
  );
}

export async function deleteEvent(weddingId: WeddingId, eventId: ObjectId): Promise<boolean> {
  const result = await scoped(weddingId).deleteOne({ _id: eventId });
  return result.deletedCount === 1;
}

/** Save a new order: each event's position in `eventIds`, in one round trip. */
export async function setEventOrder(weddingId: WeddingId, eventIds: ObjectId[], now: Date) {
  if (eventIds.length === 0) return;
  await scoped(weddingId).bulkUpdateOne(
    eventIds.map((eventId, order) => ({
      filter: { _id: eventId },
      update: { $set: { order, updatedAt: now } },
    })),
  );
}

/** Take back events just added (when a simultaneous add took the wedding over its limit). */
export async function deleteEventsByIds(weddingId: WeddingId, eventIds: ObjectId[]) {
  await scoped(weddingId).deleteMany({ _id: { $in: eventIds } });
}
