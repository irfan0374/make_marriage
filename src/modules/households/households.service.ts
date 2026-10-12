import 'server-only';
import { ObjectId, type ClientSession, type Filter } from 'mongodb';
import { MAX_HOUSEHOLDS_PER_WEDDING } from '@/config/constants';
import { withTransaction } from '@/lib/db/transaction';
import { AppError } from '@/lib/errors';
import { toObjectId, type WeddingId } from '@/lib/ids';
import { randomToken } from '@/lib/tokens';
import { getUsersByIds, type PublicUser } from '@/modules/auth';
import { getEvent } from '@/modules/events';
import { isMember, resolveWeddingContext, type WeddingContext } from '@/modules/members';
import {
  ensureGuestTags,
  getWeddingBasics,
  lockWeddingTasks,
  requireWritableWedding,
} from '@/modules/weddings';
import {
  countAllHouseholds,
  countInvitedTo,
  deleteHouseholds,
  findAllInvitedTo,
  findHousehold,
  findHouseholdsByIds,
  findLookalikes,
  insertHousehold,
  listHouseholds as listHouseholdDocs,
  summarize,
  updateHousehold,
  updateHouseholdsEach,
} from './households.repository';
import { normalizePhone } from './households.schemas';
import type {
  BulkHouseholdsInput,
  CreateHouseholdInput,
  Household,
  HouseholdDocument,
  HouseholdSide,
  HouseholdSummary,
  ListHouseholdsQuery,
  PossibleDuplicate,
  ResponseStatus,
  UpdateHouseholdInput,
} from './households.types';

// Guest families (api-spec §9, PRD GUEST-1 to GUEST-7). Every member can manage guests, but a
// Manager limited to one side only ever sees and changes that side's families; the repository
// enforces it. Writes run under the wedding lock, so an event can't be deleted while a family is
// being invited to it.

/** The side this person is limited to, or `null` when they see everyone. */
function sideScopeOf(context: WeddingContext, sidesEnabled: boolean): HouseholdSide | null {
  if (!sidesEnabled || context.role === 'admin' || context.sideScope === 'both') return null;
  return context.sideScope;
}

function fieldError(path: string, message: string): AppError {
  return new AppError('VALIDATION_ERROR', undefined, { details: [{ path, message }] });
}

function searchTextOf(doc: Pick<HouseholdDocument, 'displayName' | 'members' | 'email' | 'phone'>) {
  return [doc.displayName, ...doc.members.map((m) => m.name), doc.email ?? '', doc.phone ?? '']
    .join(' ')
    .toLowerCase();
}

/** `none` without replies, `complete` when every invited event has one, else `partial`. */
export function responseStatusOf(
  invitedEvents: { eventId: ObjectId }[],
  rsvps: { eventId: ObjectId }[],
): ResponseStatus {
  const replied = invitedEvents.filter((e) => rsvps.some((r) => r.eventId.equals(e.eventId)));
  if (replied.length === 0) return 'none';
  return replied.length === invitedEvents.length ? 'complete' : 'partial';
}

async function toHouseholds(docs: HouseholdDocument[]): Promise<Household[]> {
  const ids = new Map<string, ObjectId>();
  for (const doc of docs) {
    ids.set(doc.createdByUserId.toHexString(), doc.createdByUserId);
    ids.set(doc.editedByUserId.toHexString(), doc.editedByUserId);
  }
  const users = await getUsersByIds([...ids.values()]);
  const person = (id: ObjectId) => {
    const user: PublicUser | undefined = users.get(id.toHexString());
    return user ? { userId: user.id, name: user.name } : null;
  };
  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    displayName: doc.displayName,
    members: doc.members,
    headcount: doc.headcount,
    email: doc.email,
    phone: doc.phone,
    side: doc.side,
    tags: doc.tags,
    notes: doc.notes,
    invitedEvents: doc.invitedEvents.map((e) => ({
      eventId: e.eventId.toHexString(),
      headcount: e.headcount,
    })),
    rsvps: doc.rsvps.map((r) => ({
      eventId: r.eventId.toHexString(),
      status: r.status,
      attendingCount: r.attendingCount,
    })),
    inviteStatus: doc.inviteStatus,
    responseStatus: doc.responseStatus,
    createdBy: person(doc.createdByUserId),
    editedBy: person(doc.editedByUserId),
    editedAt: doc.editedAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  }));
}

/** Read access: a member, and their side. */
async function readerOf(token: string | undefined, weddingId: ObjectId) {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await getWeddingBasics(context.weddingId);
  if (!wedding) throw new AppError('NOT_FOUND');
  return {
    context,
    side: sideScopeOf(context, wedding.sidesEnabled),
    sidesEnabled: wedding.sidesEnabled,
  };
}

/**
 * Run a guest change: a member, in a wedding that isn't archived, under the wedding lock (which
 * also gives the current wedding document, e.g. its tags).
 */
async function writeGuests<T>(
  token: string | undefined,
  weddingId: ObjectId,
  fn: (args: {
    context: WeddingContext;
    side: HouseholdSide | null;
    wedding: Awaited<ReturnType<typeof lockWeddingTasks>>;
    session: ClientSession;
  }) => Promise<T>,
): Promise<T> {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  return withTransaction(async (session) => {
    const wedding = await lockWeddingTasks(context.weddingId, session);
    // Removed from the team a moment ago? Then not any more.
    if (!(await isMember(context.weddingId, context.userId, session))) {
      throw new AppError('NOT_FOUND');
    }
    const side = sideScopeOf(context, wedding.sidesEnabled);
    return fn({ context, side, wedding, session });
  });
}

/** Which side a family goes on, by the wedding's settings and the caller's scope. */
function resolveSide(
  requested: HouseholdSide | null | undefined,
  current: HouseholdSide | null,
  { sidesEnabled, scope }: { sidesEnabled: boolean; scope: HouseholdSide | null },
): HouseholdSide | null {
  if (!sidesEnabled) return null;
  const side = requested === undefined ? current : requested;
  if (scope) {
    if (side && side !== scope) {
      throw fieldError('side', `You can only add ${scope} side families`);
    }
    return scope;
  }
  if (!side) throw fieldError('side', 'Choose the bride side or the groom side');
  return side;
}

/** Each event must be this wedding's; each event headcount at most the family's headcount. */
async function resolveInvitedEvents(
  weddingId: WeddingId,
  events: { eventId: string; headcount?: number }[],
  headcount: number,
  session: ClientSession,
) {
  const resolved: { eventId: ObjectId; headcount: number }[] = [];
  for (const event of events) {
    const eventId = toObjectId(event.eventId);
    if (!(await getEvent(weddingId, eventId, session))) {
      throw fieldError('invitedEvents', 'Choose events from this wedding');
    }
    const count = event.headcount ?? headcount;
    if (count > headcount) {
      throw fieldError(
        'invitedEvents',
        `An event can't have more people than the family (${headcount})`,
      );
    }
    resolved.push({ eventId, headcount: count });
  }
  return resolved;
}

/**
 * Take events off a family: their replies move to `archivedRsvps` with the event's name, so a
 * reply is never silently lost (database-design §8).
 */
function withoutEvents(
  doc: HouseholdDocument,
  removed: ObjectId[],
  eventNames: Map<string, string>,
  now: Date,
): Pick<HouseholdDocument, 'invitedEvents' | 'rsvps' | 'archivedRsvps' | 'responseStatus'> {
  const gone = (id: ObjectId) => removed.some((r) => r.equals(id));
  const invitedEvents = doc.invitedEvents.filter((e) => !gone(e.eventId));
  const archived = doc.rsvps
    .filter((r) => gone(r.eventId))
    .map((r) => ({
      ...r,
      eventNameSnapshot: eventNames.get(r.eventId.toHexString()) ?? 'Event',
      archivedAt: now,
    }));
  const rsvps = doc.rsvps.filter((r) => !gone(r.eventId));
  return {
    invitedEvents,
    rsvps,
    archivedRsvps: [...doc.archivedRsvps, ...archived],
    responseStatus: responseStatusOf(invitedEvents, rsvps),
  };
}

async function eventNamesOf(weddingId: WeddingId, ids: ObjectId[], session?: ClientSession) {
  const names = new Map<string, string>();
  for (const id of ids) {
    const event = await getEvent(weddingId, id, session);
    if (event) names.set(id.toHexString(), event.name);
  }
  return names;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listHouseholds(
  token: string | undefined,
  weddingId: ObjectId,
  query: ListHouseholdsQuery,
): Promise<{ households: Household[]; nextCursor: string | null; total: number }> {
  const { context, side } = await readerOf(token, weddingId);
  const filter: Filter<HouseholdDocument> = {};
  if (query.q) filter.searchText = { $regex: escapeRegex(query.q.toLowerCase()) };
  if (query.side) filter.side = query.side;
  if (query.tags) {
    filter.tags = { $in: query.tags.map((t) => new RegExp(`^${escapeRegex(t)}$`, 'i')) };
  }
  if (query.eventId) filter['invitedEvents.eventId'] = toObjectId(query.eventId);
  if (query.inviteStatus) filter.inviteStatus = { $in: query.inviteStatus };
  if (query.responseStatus) filter.responseStatus = query.responseStatus;

  const skip = query.cursor ? Number(query.cursor) : 0;
  const { docs, total } = await listHouseholdDocs(context.weddingId, side, filter, {
    sort: query.sort,
    skip,
    limit: query.limit,
  });
  const nextCursor = skip + docs.length < total ? String(skip + docs.length) : null;
  return { households: await toHouseholds(docs), nextCursor, total };
}

export async function getHousehold(
  token: string | undefined,
  weddingId: ObjectId,
  householdId: ObjectId,
): Promise<Household> {
  const { context, side } = await readerOf(token, weddingId);
  const doc = await findHousehold(context.weddingId, side, householdId);
  if (!doc) throw new AppError('NOT_FOUND');
  return (await toHouseholds([doc]))[0]!;
}

export async function getHouseholdSummary(
  token: string | undefined,
  weddingId: ObjectId,
): Promise<HouseholdSummary> {
  const { context, side } = await readerOf(token, weddingId);
  const { overall, events } = await summarize(context.weddingId, side);
  return {
    households: overall.households,
    people: overall.people,
    events: events.map((e) => ({
      eventId: e._id.toHexString(),
      households: e.households,
      people: e.people,
    })),
    sideScope: side,
  };
}

/** Families that may be the same one (GUEST-7): a warning only, never a block. */
export async function findPossibleDuplicates(
  token: string | undefined,
  weddingId: ObjectId,
  input: { displayName?: string; email?: string; phone?: string; excludeId?: string },
): Promise<PossibleDuplicate[]> {
  const { context, side } = await readerOf(token, weddingId);
  const email = input.email?.trim().toLowerCase() || undefined;
  const phone = input.phone ? (normalizePhone(input.phone) ?? undefined) : undefined;
  const displayName = input.displayName?.trim() || undefined;
  const docs = await findLookalikes(
    context.weddingId,
    side,
    { displayName, email, phone },
    input.excludeId ? toObjectId(input.excludeId) : undefined,
  );
  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    displayName: doc.displayName,
    side: doc.side,
    reason:
      phone && doc.phone === phone ? 'phone' : email && doc.email === email ? 'email' : 'name',
  }));
}

export async function createHousehold(
  token: string | undefined,
  weddingId: ObjectId,
  input: CreateHouseholdInput,
  now = new Date(),
): Promise<Household> {
  const doc = await writeGuests(token, weddingId, async ({ context, side, wedding, session }) => {
    if ((await countAllHouseholds(context.weddingId, session)) >= MAX_HOUSEHOLDS_PER_WEDDING) {
      throw new AppError('HOUSEHOLD_LIMIT_REACHED');
    }
    const headcount = input.headcount ?? Math.max(input.members.length, 1);
    const invitedEvents = await resolveInvitedEvents(
      context.weddingId,
      input.invitedEvents,
      headcount,
      session,
    );
    const tags = await ensureGuestTags(wedding, input.tags, session);
    const base = {
      _id: new ObjectId(),
      displayName: input.displayName,
      members: input.members,
      headcount,
      email: input.email,
      phone: input.phone,
      side: resolveSide(input.side, null, { sidesEnabled: wedding.sidesEnabled, scope: side }),
      tags,
      notes: input.notes,
    };
    return insertHousehold(
      context.weddingId,
      {
        ...base,
        searchText: searchTextOf(base),
        token: randomToken(16),
        invitedEvents,
        rsvps: [],
        archivedRsvps: [],
        inviteStatus: 'not_sent',
        sentAt: null,
        openedAt: null,
        responseStatus: 'none',
        emailBounced: false,
        lastRemindedAt: null,
        reminderCount: 0,
        remindersOptOut: false,
        importBatchId: null,
        createdByUserId: context.userId,
        editedByUserId: context.userId,
        editedAt: now,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
      session,
    );
  });
  return (await toHouseholds([doc]))[0]!;
}

export async function updateHouseholdDetails(
  token: string | undefined,
  weddingId: ObjectId,
  householdId: ObjectId,
  input: UpdateHouseholdInput,
  now = new Date(),
): Promise<Household> {
  const doc = await writeGuests(token, weddingId, async ({ context, side, wedding, session }) => {
    const current = await findHousehold(context.weddingId, side, householdId, session);
    if (!current) throw new AppError('NOT_FOUND');

    const members = input.members ?? current.members;
    const headcount = input.headcount ?? current.headcount;
    for (const rsvp of current.rsvps) {
      if (rsvp.attendingCount > headcount) throw new AppError('HEADCOUNT_BELOW_RSVP');
    }

    let invited = current.invitedEvents;
    if (input.invitedEvents) {
      invited = await resolveInvitedEvents(
        context.weddingId,
        input.invitedEvents,
        headcount,
        session,
      );
    } else if (input.headcount !== undefined) {
      // A smaller family can't have more people at an event than it has.
      invited = invited.map((e) => ({ ...e, headcount: Math.min(e.headcount, headcount) }));
    }
    const removed = current.invitedEvents
      .filter((e) => !invited.some((i) => i.eventId.equals(e.eventId)))
      .map((e) => e.eventId);
    const names = await eventNamesOf(context.weddingId, removed, session);
    const events = withoutEvents({ ...current, invitedEvents: invited }, removed, names, now);
    events.responseStatus = responseStatusOf(events.invitedEvents, events.rsvps);

    const next = {
      displayName: input.displayName ?? current.displayName,
      members,
      headcount,
      email: input.email !== undefined ? input.email : current.email,
      phone: input.phone !== undefined ? input.phone : current.phone,
      side: resolveSide(input.side, current.side, {
        sidesEnabled: wedding.sidesEnabled,
        scope: side,
      }),
      tags: input.tags ? await ensureGuestTags(wedding, input.tags, session) : current.tags,
      notes: input.notes ?? current.notes,
    };
    const updated = await updateHousehold(
      context.weddingId,
      side,
      householdId,
      {
        $set: {
          ...next,
          ...events,
          searchText: searchTextOf(next),
          editedByUserId: context.userId,
          editedAt: now,
          updatedAt: now,
        },
      },
      session,
    );
    if (!updated) throw new AppError('NOT_FOUND');
    return updated;
  });
  return (await toHouseholds([doc]))[0]!;
}

export async function deleteHousehold(
  token: string | undefined,
  weddingId: ObjectId,
  householdId: ObjectId,
): Promise<void> {
  await writeGuests(token, weddingId, async ({ context, side, session }) => {
    const deleted = await deleteHouseholds(context.weddingId, side, [householdId], session);
    if (deleted === 0) throw new AppError('NOT_FOUND');
  });
}

/** Bulk actions on selected families (api-spec §9.8), only the caller's side. */
export async function bulkUpdateHouseholds(
  token: string | undefined,
  weddingId: ObjectId,
  input: BulkHouseholdsInput,
  now = new Date(),
): Promise<{ updated: number }> {
  return writeGuests(token, weddingId, async ({ context, side, wedding, session }) => {
    const ids = [...new Set(input.householdIds.map((id) => id.toLowerCase()))].map(toObjectId);
    if (input.action === 'delete') {
      return { updated: await deleteHouseholds(context.weddingId, side, ids, session) };
    }
    const docs = await findHouseholdsByIds(context.weddingId, side, ids, session);
    const edited = { editedByUserId: context.userId, editedAt: now, updatedAt: now };
    let updates: { id: ObjectId; set: Partial<HouseholdDocument> }[] = [];

    if (input.action === 'assign_events') {
      const eventIds = [...new Set(input.eventIds.map((id) => id.toLowerCase()))].map(toObjectId);
      for (const id of eventIds) {
        if (!(await getEvent(context.weddingId, id, session))) {
          throw fieldError('eventIds', 'Choose events from this wedding');
        }
      }
      updates = docs.flatMap((doc) => {
        const missing = eventIds.filter(
          (id) => !doc.invitedEvents.some((e) => e.eventId.equals(id)),
        );
        if (missing.length === 0) return [];
        const invitedEvents = [
          ...doc.invitedEvents,
          ...missing.map((eventId) => ({ eventId, headcount: doc.headcount })),
        ];
        return [
          {
            id: doc._id,
            set: {
              invitedEvents,
              responseStatus: responseStatusOf(invitedEvents, doc.rsvps),
              ...edited,
            },
          },
        ];
      });
    } else if (input.action === 'remove_events') {
      const eventIds = input.eventIds.map(toObjectId);
      const names = await eventNamesOf(context.weddingId, eventIds, session);
      updates = docs.flatMap((doc) =>
        doc.invitedEvents.some((e) => eventIds.some((id) => id.equals(e.eventId)))
          ? [{ id: doc._id, set: { ...withoutEvents(doc, eventIds, names, now), ...edited } }]
          : [],
      );
    } else if (input.action === 'add_tags') {
      const tags = await ensureGuestTags(wedding, input.tags, session);
      updates = docs.flatMap((doc) => {
        const missing = tags.filter(
          (t) => !doc.tags.some((d) => d.toLowerCase() === t.toLowerCase()),
        );
        return missing.length > 0
          ? [{ id: doc._id, set: { tags: [...doc.tags, ...missing], ...edited } }]
          : [];
      });
    } else if (input.action === 'remove_tags') {
      const drop = new Set(input.tags.map((t) => t.toLowerCase()));
      updates = docs.flatMap((doc) =>
        doc.tags.some((t) => drop.has(t.toLowerCase()))
          ? [
              {
                id: doc._id,
                set: { tags: doc.tags.filter((t) => !drop.has(t.toLowerCase())), ...edited },
              },
            ]
          : [],
      );
    }
    await updateHouseholdsEach(context.weddingId, side, updates, session);
    return { updated: updates.length };
  });
}

/**
 * Families invited to an event, as far as this person can see: the event delete warning
 * (api-spec §8.5). Side-scoped like every other guest count.
 */
export async function countFamiliesInvitedTo(context: WeddingContext, eventId: ObjectId) {
  const wedding = await getWeddingBasics(context.weddingId);
  const side = wedding ? sideScopeOf(context, wedding.sidesEnabled) : null;
  return countInvitedTo(context.weddingId, side, eventId);
}

/** Every family invited to an event, whatever the side: whether deleting it needs a confirm. */
export function countAllFamiliesInvitedTo(weddingId: WeddingId, eventId: ObjectId) {
  return countInvitedTo(weddingId, null, eventId);
}

/**
 * Cleanup when an event is deleted (database-design §8): it comes off every family, and their
 * replies for it are archived with the event's name. Runs in the cleanup module's transaction.
 */
export async function removeEventFromHouseholds(
  weddingId: WeddingId,
  eventId: ObjectId,
  eventName: string,
  session: ClientSession,
  now = new Date(),
) {
  const docs = await findAllInvitedTo(weddingId, eventId, session);
  const names = new Map([[eventId.toHexString(), eventName]]);
  await updateHouseholdsEach(
    weddingId,
    null,
    docs.map((doc) => ({
      id: doc._id,
      set: { ...withoutEvents(doc, [eventId], names, now), updatedAt: now },
    })),
    session,
  );
}
