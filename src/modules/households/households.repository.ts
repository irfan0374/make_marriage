import 'server-only';
import type { ClientSession, Filter, ObjectId, UpdateFilter } from 'mongodb';
import { globalCollection } from '@/lib/db/client';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import { HOUSEHOLDS, NAME_COLLATION } from './households.indexes';
import type { HouseholdDocument, HouseholdSide } from './households.types';

// Side scoping lives here (CLAUDE.md security rules): every read and write takes the caller's
// side (`null` = sees everyone) and filters by it, so a Manager limited to the groom side can
// never see, count, change or delete a bride-side family, whatever the request says.

const scoped = (weddingId: WeddingId) => scopedCollection<HouseholdDocument>(HOUSEHOLDS, weddingId);

/**
 * The caller's side, ANDed with the rest of the filter, so a request can narrow it but never
 * widen it: asking a groom-side Manager's list for the bride side finds nothing.
 */
function inSide(
  side: HouseholdSide | null,
  filter: Filter<HouseholdDocument> = {},
): Filter<HouseholdDocument> {
  return side ? { $and: [filter, { side }] } : filter;
}

const SORTS = {
  name: { displayName: 1, _id: 1 },
  '-createdAt': { createdAt: -1, _id: -1 },
  '-updatedAt': { updatedAt: -1, _id: -1 },
} as const;

export async function listHouseholds(
  weddingId: WeddingId,
  side: HouseholdSide | null,
  filter: Filter<HouseholdDocument>,
  { sort, skip, limit }: { sort: keyof typeof SORTS; skip: number; limit: number },
) {
  const query = inSide(side, filter);
  const [docs, total] = await Promise.all([
    scoped(weddingId)
      .find(query, { sort: SORTS[sort], skip, limit, collation: NAME_COLLATION })
      .toArray(),
    scoped(weddingId).countDocuments(query, { collation: NAME_COLLATION }),
  ]);
  return { docs, total };
}

export function findHousehold(
  weddingId: WeddingId,
  side: HouseholdSide | null,
  householdId: ObjectId,
  session?: ClientSession,
) {
  return scoped(weddingId).findOne(inSide(side, { _id: householdId }), { session });
}

/** Families among `ids` the caller may touch. */
export function findHouseholdsByIds(
  weddingId: WeddingId,
  side: HouseholdSide | null,
  ids: ObjectId[],
  session?: ClientSession,
) {
  return scoped(weddingId)
    .find(inSide(side, { _id: { $in: ids } }), { session })
    .toArray();
}

/** Every family, whatever the side: for limits only, never shown to a caller. */
export function countAllHouseholds(weddingId: WeddingId, session?: ClientSession) {
  return scoped(weddingId).countDocuments({}, { session });
}

export async function insertHousehold(
  weddingId: WeddingId,
  doc: Omit<HouseholdDocument, 'weddingId'>,
  session: ClientSession,
): Promise<HouseholdDocument> {
  await scoped(weddingId).insertOne(doc, { session });
  return { ...doc, weddingId };
}

export function updateHousehold(
  weddingId: WeddingId,
  side: HouseholdSide | null,
  householdId: ObjectId,
  update: UpdateFilter<HouseholdDocument>,
  session: ClientSession,
) {
  return scoped(weddingId).findOneAndUpdate(inSide(side, { _id: householdId }), update, {
    returnDocument: 'after',
    session,
  });
}

/** Write each family's new state (bulk actions, event cleanup). */
export async function updateHouseholdsEach(
  weddingId: WeddingId,
  side: HouseholdSide | null,
  updates: { id: ObjectId; set: Partial<HouseholdDocument> }[],
  session: ClientSession,
) {
  if (updates.length === 0) return;
  await scoped(weddingId).bulkUpdateOne(
    updates.map(({ id, set }) => ({ filter: inSide(side, { _id: id }), update: { $set: set } })),
    { session },
  );
}

export async function deleteHouseholds(
  weddingId: WeddingId,
  side: HouseholdSide | null,
  ids: ObjectId[],
  session: ClientSession,
): Promise<number> {
  const result = await scoped(weddingId).deleteMany(inSide(side, { _id: { $in: ids } }), {
    session,
  });
  return result.deletedCount;
}

/** Families that look like the same one: same phone, same email, or same name. */
export function findLookalikes(
  weddingId: WeddingId,
  side: HouseholdSide | null,
  { displayName, email, phone }: { displayName?: string; email?: string; phone?: string },
  excludeId?: ObjectId,
) {
  const or: Filter<HouseholdDocument>[] = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  if (displayName) or.push({ displayName });
  if (or.length === 0) return Promise.resolve([]);
  return scoped(weddingId)
    .find(inSide(side, { $or: or, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }), {
      projection: { displayName: 1, side: 1, phone: 1, email: 1 },
      collation: NAME_COLLATION,
      limit: 5,
    })
    .toArray();
}

/** Families and people, overall and per invited event, within the caller's side. */
export async function summarize(weddingId: WeddingId, side: HouseholdSide | null) {
  const match = side ? [{ $match: { side } }] : [];
  const [overall] = await scoped(weddingId)
    .aggregate<{ households: number; people: number }>([
      ...match,
      { $group: { _id: null, households: { $sum: 1 }, people: { $sum: '$headcount' } } },
    ])
    .toArray();
  const events = await scoped(weddingId)
    .aggregate<{ _id: ObjectId; households: number; people: number }>([
      ...match,
      { $unwind: '$invitedEvents' },
      {
        $group: {
          _id: '$invitedEvents.eventId',
          households: { $sum: 1 },
          people: { $sum: '$invitedEvents.headcount' },
        },
      },
    ])
    .toArray();
  return { overall: overall ?? { households: 0, people: 0 }, events };
}

/** Families invited to an event, within the caller's side. */
export function countInvitedTo(
  weddingId: WeddingId,
  side: HouseholdSide | null,
  eventId: ObjectId,
  session?: ClientSession,
) {
  return scoped(weddingId).countDocuments(inSide(side, { 'invitedEvents.eventId': eventId }), {
    session,
  });
}

/** Every family invited to an event, whatever the side: for the event delete cleanup. */
export function findAllInvitedTo(weddingId: WeddingId, eventId: ObjectId, session: ClientSession) {
  return scoped(weddingId).find({ 'invitedEvents.eventId': eventId }, { session }).toArray();
}

/**
 * A family by its personal invitation link. A link names its own wedding, so this is the one
 * lookup that isn't filtered by a wedding id first; the service then works inside that wedding.
 */
export function findHouseholdByToken(token: string) {
  return globalCollection<HouseholdDocument>(HOUSEHOLDS).findOne({ token });
}

/** First time the guest page loaded in a browser; later calls change nothing. */
export async function setOpenedAt(weddingId: WeddingId, householdId: ObjectId, now: Date) {
  await scoped(weddingId).updateOne(
    { _id: householdId, openedAt: null },
    { $set: { openedAt: now, updatedAt: now } },
  );
}

export async function setRemindersOptOut(weddingId: WeddingId, householdId: ObjectId, now: Date) {
  await scoped(weddingId).updateOne(
    { _id: householdId },
    { $set: { remindersOptOut: true, updatedAt: now } },
  );
}

/** Invitation progress over the caller's side (api-spec §10.9). */
export async function summarizeInvitations(weddingId: WeddingId, side: HouseholdSide | null) {
  const match = side ? [{ $match: { side } }] : [];
  const [overall] = await scoped(weddingId)
    .aggregate<{
      households: number;
      sent: number;
      opened: number;
      complete: number;
      partial: number;
      withoutEmail: number;
    }>([
      ...match,
      {
        $group: {
          _id: null,
          households: { $sum: 1 },
          sent: { $sum: { $cond: [{ $in: ['$inviteStatus', ['sent', 'sent_manually']] }, 1, 0] } },
          opened: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$openedAt', null] }, null] }, 1, 0] } },
          complete: { $sum: { $cond: [{ $eq: ['$responseStatus', 'complete'] }, 1, 0] } },
          partial: { $sum: { $cond: [{ $eq: ['$responseStatus', 'partial'] }, 1, 0] } },
          withoutEmail: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$email', null] }, null] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  // Per event: the family's reply for that event, if any (database-design §7.5).
  const events = await scoped(weddingId)
    .aggregate<{
      _id: ObjectId;
      invitedHouseholds: number;
      invitedHeadcount: number;
      respondedHouseholds: number;
      attendingHouseholds: number;
      attendingHeadcount: number;
      declinedHouseholds: number;
    }>([
      ...match,
      { $unwind: '$invitedEvents' },
      {
        $addFields: {
          rsvp: {
            $first: {
              $filter: {
                input: '$rsvps',
                as: 'r',
                cond: { $eq: ['$$r.eventId', '$invitedEvents.eventId'] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$invitedEvents.eventId',
          invitedHouseholds: { $sum: 1 },
          invitedHeadcount: { $sum: '$invitedEvents.headcount' },
          respondedHouseholds: { $sum: { $cond: [{ $ifNull: ['$rsvp', false] }, 1, 0] } },
          attendingHouseholds: { $sum: { $cond: [{ $eq: ['$rsvp.status', 'attending'] }, 1, 0] } },
          attendingHeadcount: { $sum: { $ifNull: ['$rsvp.attendingCount', 0] } },
          declinedHouseholds: { $sum: { $cond: [{ $eq: ['$rsvp.status', 'declined'] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  return {
    overall: overall ?? {
      households: 0,
      sent: 0,
      opened: 0,
      complete: 0,
      partial: 0,
      withoutEmail: 0,
    },
    events,
  };
}

/** Every family with an invited event, within the caller's side, for the replies export. */
export function findInvitedHouseholds(weddingId: WeddingId, side: HouseholdSide | null) {
  return scoped(weddingId)
    .find(inSide(side, { 'invitedEvents.0': { $exists: true } }), {
      sort: { displayName: 1, _id: 1 },
      collation: NAME_COLLATION,
    })
    .toArray();
}

/** Families to consider for an email send, within the caller's side. */
export function findForSending(
  weddingId: WeddingId,
  side: HouseholdSide | null,
  filter: Filter<HouseholdDocument>,
  session: ClientSession,
) {
  return scoped(weddingId)
    .find(inSide(side, filter), {
      session,
      sort: { displayName: 1, _id: 1 },
      collation: NAME_COLLATION,
    })
    .toArray();
}

/**
 * Update one family only while it still matches `filter` (e.g. still queued), for the email
 * jobs, which run without a person behind them. Returns whether it changed.
 */
export async function updateHouseholdIf(
  weddingId: WeddingId,
  householdId: ObjectId,
  filter: Filter<HouseholdDocument>,
  update: UpdateFilter<HouseholdDocument>,
  session?: ClientSession,
): Promise<boolean> {
  const result = await scoped(weddingId).updateOne({ ...filter, _id: householdId }, update, {
    session,
  });
  return result.modifiedCount > 0;
}
