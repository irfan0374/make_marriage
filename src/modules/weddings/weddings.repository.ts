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

/** Serialize task writes and reference cleanup on this wedding's document. */
export function lockTaskWrites(weddingId: WeddingId, session: ClientSession) {
  return weddings().findOneAndUpdate(
    { _id: weddingId },
    { $inc: { taskWriteVersion: 1 } },
    { session, returnDocument: 'after', includeResultMetadata: false },
  );
}

/** Replace the wedding's guest tag list (called under the wedding lock). */
export function setGuestTags(weddingId: WeddingId, guestTags: string[], session: ClientSession) {
  return weddings().updateOne({ _id: weddingId }, { $set: { guestTags } }, { session });
}

/**
 * Save the invitation settings and return the updated wedding, or `null` if it was archived (or
 * deleted) a moment ago.
 */
export function setInvitation(
  weddingId: WeddingId,
  invitation: WeddingDocument['invitation'],
  now: Date,
) {
  return weddings().findOneAndUpdate(
    { _id: weddingId, status: 'active' },
    { $set: { invitation, updatedAt: now } },
    { returnDocument: 'after', includeResultMetadata: false },
  );
}

/**
 * Active weddings with automatic RSVP reminders on and a deadline set, for the scheduled run.
 * The one cross-wedding read: it returns only what the reminder run needs.
 */
export function findWeddingsWithAutoReminders() {
  return weddings()
    .find(
      {
        status: 'active',
        'invitation.autoRemindersEnabled': true,
        'invitation.rsvpDeadline': { $type: 'string' },
      },
      { projection: { timezone: 1, 'invitation.rsvpDeadline': 1 } },
    )
    .toArray();
}

/** Every active wedding's id and timezone, for scheduled work that runs per wedding. */
export function findActiveWeddingTimezones() {
  return weddings()
    .find({ status: 'active' }, { projection: { timezone: 1 } })
    .toArray();
}

/** Replace the wedding's custom expense categories (called under the wedding lock). */
export function setCustomExpenseCategories(
  weddingId: WeddingId,
  categories: string[],
  now: Date,
  session: ClientSession,
) {
  return weddings().updateOne(
    { _id: weddingId },
    { $set: { customExpenseCategories: categories, updatedAt: now } },
    { session },
  );
}

/**
 * Change only the given website fields (`$set` paths under `website.`), so one person's save never
 * undoes another's change to a different field. `expected` are values the matching fields must
 * still have (a compare-and-set, e.g. the photos the editor started from). Returns the updated
 * wedding, or `null` if it was archived or an expected value changed meanwhile. A taken address
 * throws `DuplicateSlugError`.
 */
export async function setWebsiteFields(
  weddingId: WeddingId,
  changes: Record<string, unknown>,
  expected: Record<string, unknown>,
  now: Date,
) {
  const prefix = (fields: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(fields).map(([k, v]) => [`website.${k}`, v]));
  try {
    return await weddings().findOneAndUpdate(
      { _id: weddingId, status: 'active', ...prefix(expected) },
      { $set: { ...prefix(changes), updatedAt: now } },
      { returnDocument: 'after', includeResultMetadata: false },
    );
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

/** The wedding whose website lives at `/w/{slug}` (public lookup; callers check `published`). */
export function findWeddingBySlug(slug: string) {
  return weddings().findOne({ 'website.slug': slug });
}

/** Whether another wedding uses this website address. */
export async function isSlugUsedByOther(slug: string, weddingId: WeddingId): Promise<boolean> {
  const doc = await weddings().findOne(
    { 'website.slug': slug, _id: { $ne: weddingId } },
    { projection: { _id: 1 } },
  );
  return doc !== null;
}
