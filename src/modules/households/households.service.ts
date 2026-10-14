import 'server-only';
import { ObjectId, type ClientSession, type Filter } from 'mongodb';
import { MAX_HOUSEHOLDS_PER_WEDDING } from '@/config/constants';
import { withTransaction } from '@/lib/db/transaction';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { toObjectId, trustWeddingId, type WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { randomToken } from '@/lib/tokens';
import { recordAudit } from '@/modules/audit';
import { getUsersByIds, type PublicUser } from '@/modules/auth';
import { getEvent, listEvents } from '@/modules/events';
import { makeCsv } from '@/shared/csv';
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
  findForSending,
  findHousehold,
  findHouseholdByToken,
  findInvitedHouseholds,
  findHouseholdsByIds,
  findLookalikes,
  insertHousehold,
  listHouseholds as listHouseholdDocs,
  setOpenedAt,
  setRemindersOptOut,
  summarize,
  summarizeInvitations,
  updateHousehold,
  updateHouseholdIf,
  updateHouseholdsEach,
} from './households.repository';
import {
  normalizePhone,
  importHouseholdRowSchema,
  type importHouseholdsSchema,
} from './households.schemas';
import type { z } from 'zod';
import type { HouseholdImportResult } from './households.types';
import type {
  BulkHouseholdsInput,
  CreateHouseholdInput,
  Household,
  HouseholdDocument,
  HouseholdSide,
  HouseholdSummary,
  ListHouseholdsQuery,
  HostRsvpInput,
  PossibleDuplicate,
  ResponseStatus,
  RsvpDocument,
  RsvpReply,
  RsvpSummary,
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

/** A family's personal invitation page (PRD INV-5). */
export function inviteLinkOf(token: string): string {
  return new URL(`/invited/${token}`, getEnv().APP_URL).toString();
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
      note: r.note ?? '',
      recordedBy: r.recordedBy,
      respondedAt: r.respondedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    inviteLink: inviteLinkOf(doc.token),
    inviteStatus: doc.inviteStatus,
    sentAt: doc.sentAt?.toISOString() ?? null,
    openedAt: doc.openedAt?.toISOString() ?? null,
    responseStatus: doc.responseStatus,
    emailBounced: doc.emailBounced,
    reminderCount: doc.reminderCount,
    createdBy: person(doc.createdByUserId),
    editedBy: person(doc.editedByUserId),
    editedAt: doc.editedAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
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
  session: ClientSession | undefined,
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
  if (query.emailBounced) filter.emailBounced = true;

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
  importing?: { batchId: string; createMissingTags: boolean },
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
    if (
      importing &&
      !importing.createMissingTags &&
      input.tags.some(
        (tag) => !wedding.guestTags.some((known) => known.toLowerCase() === tag.toLowerCase()),
      )
    ) {
      throw fieldError(
        'tags',
        'This tag does not exist. Enable creating new tags or choose an existing tag.',
      );
    }
    const resolvedSide = resolveSide(input.side, null, {
      sidesEnabled: wedding.sidesEnabled,
      scope: side,
    });
    const tags = await ensureGuestTags(wedding, input.tags, session);
    const base = {
      _id: new ObjectId(),
      displayName: input.displayName,
      members: input.members,
      headcount,
      email: input.email,
      phone: input.phone,
      side: resolvedSide,
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
        importBatchId: importing?.batchId ?? null,
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
          // A corrected address hasn't bounced (yet).
          ...(next.email !== current.email ? { emailBounced: false } : {}),
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

/** Dry-run never writes; actual rows use the same locked creation path as Add family. */
export async function importHouseholds(
  token: string | undefined,
  weddingId: ObjectId,
  input: z.output<typeof importHouseholdsSchema>,
): Promise<HouseholdImportResult> {
  const { context, side, sidesEnabled } = await readerOf(token, weddingId);
  const wedding = await requireWritableWedding(context.weddingId);
  const result: HouseholdImportResult = {
    importBatchId: input.dryRun ? null : `imp_${new ObjectId().toHexString()}`,
    created: 0,
    failed: 0,
    valid: 0,
    errors: [],
    possibleDuplicates: [],
    duplicateRows: [],
  };
  const knownTags = new Set(wedding.guestTags.map((tag) => tag.toLowerCase()));
  const seen = new Map<string, number>();
  const capacity = MAX_HOUSEHOLDS_PER_WEDDING - (await countAllHouseholds(context.weddingId));
  for (let i = 0; i < input.rows.length; i++) {
    const row = i + 1;
    const parsed = importHouseholdRowSchema.safeParse(input.rows[i]);
    if (!parsed.success) {
      result.failed++;
      result.errors.push(
        ...parsed.error.issues.map((issue) => ({
          row,
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
      continue;
    }
    const values = parsed.data;
    try {
      resolveSide(values.side, null, { sidesEnabled, scope: side });
      await resolveInvitedEvents(
        context.weddingId,
        values.invitedEvents,
        values.headcount ?? Math.max(values.members.length, 1),
        undefined,
      );
      const newTags = values.tags
        .map((tag) => tag.toLowerCase())
        .filter((tag) => !knownTags.has(tag));
      if (!input.createMissingTags && newTags.length)
        throw fieldError('tags', 'Choose existing tags or enable creating new tags.');
      if (knownTags.size + newTags.length > 50)
        throw fieldError('tags', 'A wedding can have at most 50 tags');
      if (input.dryRun && result.valid >= capacity) throw new AppError('HOUSEHOLD_LIMIT_REACHED');
      const duplicates = await findPossibleDuplicates(token, weddingId, {
        displayName: values.displayName,
        email: values.email ?? undefined,
        phone: values.phone ?? undefined,
      });
      result.possibleDuplicates.push(
        ...duplicates.map((d) => ({ row, existingHouseholdId: d.id })),
      );
      const keys = [
        `name:${values.displayName.toLowerCase()}`,
        ...(values.email ? [`email:${values.email}`] : []),
        ...(values.phone ? [`phone:${values.phone}`] : []),
      ];
      const previous = keys.map((key) => seen.get(key)).find((match) => match !== undefined);
      if (previous !== undefined) result.duplicateRows.push({ row, matchesRow: previous });
      if (!input.dryRun) {
        await createHousehold(token, weddingId, values, new Date(), {
          batchId: result.importBatchId!,
          createMissingTags: input.createMissingTags,
        });
        result.created++;
      }
      for (const tag of newTags) knownTags.add(tag);
      for (const key of keys) if (!seen.has(key)) seen.set(key, row);
      result.valid++;
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        !['VALIDATION_ERROR', 'HOUSEHOLD_LIMIT_REACHED'].includes(error.code)
      )
        throw error;
      result.failed++;
      const details =
        Array.isArray(error.details) && error.details.length
          ? error.details
          : [{ path: '', message: error.message }];
      result.errors.push(
        ...details.map((detail) => ({ row, path: detail.path, message: detail.message })),
      );
    }
  }
  return result;
}

/** Export all matching families, not merely the visible page, using the list's side checks. */
export async function exportHouseholds(
  token: string | undefined,
  weddingId: ObjectId,
  query: ListHouseholdsQuery,
): Promise<string> {
  const events = await listEvents(token, weddingId);
  const all: Household[] = [];
  let cursor: string | undefined;
  do {
    const page = await listHouseholds(token, weddingId, { ...query, limit: 100, cursor });
    all.push(...page.households);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && all.length < MAX_HOUSEHOLDS_PER_WEDDING);
  return makeCsv([
    [
      'displayName',
      'members',
      'headcount',
      'email',
      'phone',
      'side',
      'tags',
      'notes',
      'eventIds',
      'inviteStatus',
      'responseStatus',
      ...events.flatMap((event) => [
        `${event.name} (${event.id}) invited`,
        `${event.name} (${event.id}) reply`,
        `${event.name} (${event.id}) attending`,
      ]),
    ],
    ...all.map((h) => [
      h.displayName,
      h.members.map((m) => m.name).join('; '),
      h.headcount,
      h.email,
      h.phone,
      h.side,
      h.tags.join('; '),
      h.notes,
      h.invitedEvents.map((event) => event.eventId).join('; '),
      h.inviteStatus,
      h.responseStatus,
      ...events.flatMap((event) => {
        const invite = h.invitedEvents.find((e) => e.eventId === event.id);
        const reply = h.rsvps.find((e) => e.eventId === event.id);
        return [
          invite?.headcount ?? '',
          invite ? (reply?.status ?? 'pending') : '',
          reply?.attendingCount ?? '',
        ];
      }),
    ]),
  ]);
}

// Invitation links and replies (api-spec §9.10–9.13, §10.9, §11). The guest page and its
// rules (deadline, rate limits, emails) live in the invitations module; these functions own the
// family records themselves.

/** POST .../households/{householdId}/regenerate-link (api-spec §9.10): the old link stops working. */
export async function regenerateHouseholdLink(
  token: string | undefined,
  weddingId: ObjectId,
  householdId: ObjectId,
  now = new Date(),
): Promise<{ inviteLink: string }> {
  const doc = await writeGuests(token, weddingId, async ({ context, side, session }) => {
    const updated = await updateHousehold(
      context.weddingId,
      side,
      householdId,
      { $set: { token: randomToken(16), updatedAt: now } },
      session,
    );
    if (!updated) throw new AppError('NOT_FOUND');
    await recordAudit(
      context.weddingId,
      {
        actor: { type: 'user', userId: context.userId },
        action: 'household.link_regenerated',
        targetType: 'household',
        targetId: householdId,
      },
      session,
      now,
    );
    return updated;
  });
  logger.info('household.link_regenerated', { householdId: householdId.toHexString() });
  return { inviteLink: inviteLinkOf(doc.token) };
}

/**
 * POST .../households/{householdId}/mark-sent (api-spec §9.11): the link was shared by hand
 * (e.g. on WhatsApp). A family already sent an email keeps that status.
 */
export async function markHouseholdSent(
  token: string | undefined,
  weddingId: ObjectId,
  householdId: ObjectId,
  now = new Date(),
): Promise<Household> {
  const doc = await writeGuests(token, weddingId, async ({ context, side, session }) => {
    const current = await findHousehold(context.weddingId, side, householdId, session);
    if (!current) throw new AppError('NOT_FOUND');
    if (current.inviteStatus === 'sent' || current.inviteStatus === 'sent_manually') {
      return current;
    }
    const updated = await updateHousehold(
      context.weddingId,
      side,
      householdId,
      { $set: { inviteStatus: 'sent_manually', sentAt: current.sentAt ?? now, updatedAt: now } },
      session,
    );
    if (!updated) throw new AppError('NOT_FOUND');
    return updated;
  });
  return (await toHouseholds([doc]))[0]!;
}

/** A reply as a short audit value, e.g. `attending:3`, `declined`, or `null` for none. */
function replyValue(rsvp: Pick<RsvpDocument, 'status' | 'attendingCount'> | undefined) {
  if (!rsvp) return null;
  return rsvp.status === 'attending' ? `attending:${rsvp.attendingCount}` : 'declined';
}

/** What changed per event, for the audit log (only events whose answer changed). */
function replyChanges(before: RsvpDocument[], after: RsvpDocument[]) {
  return after.flatMap((rsvp) => {
    const old = before.find((r) => r.eventId.equals(rsvp.eventId));
    const from = replyValue(old);
    const to = replyValue(rsvp);
    return from === to && (old?.note ?? '') === (rsvp.note ?? '')
      ? []
      : [{ eventId: rsvp.eventId.toHexString(), before: from, after: to }];
  });
}

/**
 * Apply replies to a family: each event must be one it's invited to, and attending at most its
 * invited number for that event. An existing reply keeps its first reply time. The last write
 * wins (PRD INV key criteria).
 */
function withReplies(
  doc: HouseholdDocument,
  replies: RsvpReply[],
  by: { recordedBy: 'guest' } | { recordedBy: 'host'; userId: ObjectId },
  now: Date,
): Pick<HouseholdDocument, 'rsvps' | 'responseStatus'> {
  const rsvps = [...doc.rsvps];
  for (const reply of replies) {
    const eventId = toObjectId(reply.eventId);
    const invited = doc.invitedEvents.find((e) => e.eventId.equals(eventId));
    if (!invited) throw new AppError('NOT_INVITED_TO_EVENT');
    if (reply.attendingCount > invited.headcount) {
      throw new AppError('HEADCOUNT_EXCEEDED', undefined, {
        details: [
          {
            path: 'attendingCount',
            message: `At most ${invited.headcount} ${invited.headcount === 1 ? 'person is' : 'people are'} invited`,
          },
        ],
      });
    }
    const index = rsvps.findIndex((r) => r.eventId.equals(eventId));
    const next: RsvpDocument = {
      eventId,
      status: reply.status,
      attendingCount: reply.attendingCount,
      note: reply.note,
      recordedBy: by.recordedBy,
      ...(by.recordedBy === 'host' ? { recordedByUserId: by.userId } : {}),
      respondedAt: index >= 0 ? rsvps[index]!.respondedAt : now,
      updatedAt: now,
    };
    if (index >= 0) rsvps[index] = next;
    else rsvps.push(next);
  }
  return { rsvps, responseStatus: responseStatusOf(doc.invitedEvents, rsvps) };
}

/**
 * PUT .../households/{householdId}/rsvps/{eventId} (api-spec §9.12, PRD INV-17): a reply taken
 * by phone or WhatsApp, labelled "Recorded by host". Allowed after the deadline.
 */
export async function recordHostRsvp(
  token: string | undefined,
  weddingId: ObjectId,
  householdId: ObjectId,
  eventId: ObjectId,
  input: HostRsvpInput,
  now = new Date(),
): Promise<Household> {
  const doc = await writeGuests(token, weddingId, async ({ context, side, session }) => {
    const current = await findHousehold(context.weddingId, side, householdId, session);
    if (!current) throw new AppError('NOT_FOUND');
    const replies = withReplies(
      current,
      [{ ...input, eventId: eventId.toHexString() }],
      { recordedBy: 'host', userId: context.userId },
      now,
    );
    const updated = await updateHousehold(
      context.weddingId,
      side,
      householdId,
      { $set: { ...replies, updatedAt: now } },
      session,
    );
    if (!updated) throw new AppError('NOT_FOUND');
    await recordAudit(
      context.weddingId,
      {
        actor: { type: 'user', userId: context.userId },
        action: 'rsvp.recorded_by_host',
        targetType: 'household',
        targetId: householdId,
        meta: { changes: replyChanges(current.rsvps, replies.rsvps) },
      },
      session,
      now,
    );
    return updated;
  });
  logger.info('rsvp.saved', { householdId: householdId.toHexString(), recordedBy: 'host' });
  return (await toHouseholds([doc]))[0]!;
}

/** DELETE .../households/{householdId}/rsvps/{eventId} (api-spec §9.13): back to waiting. */
export async function clearHostRsvp(
  token: string | undefined,
  weddingId: ObjectId,
  householdId: ObjectId,
  eventId: ObjectId,
  now = new Date(),
): Promise<void> {
  await writeGuests(token, weddingId, async ({ context, side, session }) => {
    const current = await findHousehold(context.weddingId, side, householdId, session);
    if (!current) throw new AppError('NOT_FOUND');
    const rsvps = current.rsvps.filter((r) => !r.eventId.equals(eventId));
    if (rsvps.length === current.rsvps.length) return;
    await recordAudit(
      context.weddingId,
      {
        actor: { type: 'user', userId: context.userId },
        action: 'rsvp.cleared',
        targetType: 'household',
        targetId: householdId,
        meta: {
          eventId: eventId.toHexString(),
          before: replyValue(current.rsvps.find((r) => r.eventId.equals(eventId))),
        },
      },
      session,
      now,
    );
    await updateHousehold(
      context.weddingId,
      side,
      householdId,
      {
        $set: {
          rsvps,
          responseStatus: responseStatusOf(current.invitedEvents, rsvps),
          updatedAt: now,
        },
      },
      session,
    );
  });
}

/** The family behind a personal link, and its wedding, or `null` for an unknown link. */
export async function findInvitationHousehold(
  token: string,
): Promise<{ weddingId: WeddingId; household: HouseholdDocument } | null> {
  const household = await findHouseholdByToken(token);
  if (!household) return null;
  // The link itself names the wedding (architecture §7.5).
  return { weddingId: trustWeddingId(household.weddingId), household };
}

/**
 * Save a guest's replies from their personal page (api-spec §11.2). `check` runs under the
 * wedding lock with the current wedding, so the caller can refuse late or archived replies
 * without a race. Throws LINK_INVALID if the link was regenerated meanwhile.
 */
export async function saveGuestRsvps(
  token: string,
  replies: RsvpReply[],
  check: (wedding: Awaited<ReturnType<typeof lockWeddingTasks>>) => void,
  now = new Date(),
): Promise<HouseholdDocument> {
  const found = await findInvitationHousehold(token);
  if (!found) throw new AppError('LINK_INVALID');
  const { weddingId } = found;
  const doc = await withTransaction(async (session) => {
    const wedding = await lockWeddingTasks(weddingId, session);
    check(wedding);
    const current = await findHousehold(weddingId, null, found.household._id, session);
    if (!current || current.token !== token) throw new AppError('LINK_INVALID');
    const next = withReplies(current, replies, { recordedBy: 'guest' }, now);
    const updated = await updateHousehold(
      weddingId,
      null,
      current._id,
      { $set: { ...next, updatedAt: now } },
      session,
    );
    if (!updated) throw new AppError('LINK_INVALID');
    // Last write wins; the log keeps both sides when a guest and the couple edit together.
    await recordAudit(
      weddingId,
      {
        actor: { type: 'guest', householdId: current._id },
        action: 'rsvp.submitted',
        targetType: 'household',
        targetId: current._id,
        meta: { changes: replyChanges(current.rsvps, next.rsvps) },
      },
      session,
      now,
    );
    return updated;
  });
  logger.info('rsvp.saved', { householdId: doc._id.toHexString(), recordedBy: 'guest' });
  return doc;
}

/** The guest page loaded in a browser (api-spec §11.5). */
export async function markInvitationOpened(token: string, now = new Date()): Promise<void> {
  const found = await findInvitationHousehold(token);
  if (!found) throw new AppError('LINK_INVALID');
  if (found.household.openedAt) return;
  await setOpenedAt(found.weddingId, found.household._id, now);
}

/** The guest turned off reminder emails (api-spec §11.4). */
export async function stopInvitationReminders(token: string, now = new Date()): Promise<void> {
  const found = await findInvitationHousehold(token);
  if (!found) throw new AppError('LINK_INVALID');
  await setRemindersOptOut(found.weddingId, found.household._id, now);
}

/** GET /api/weddings/{weddingId}/rsvp/summary (api-spec §10.9), within the caller's side. */
export async function getRsvpSummary(
  token: string | undefined,
  weddingId: ObjectId,
): Promise<RsvpSummary> {
  const { context, side } = await readerOf(token, weddingId);
  const { overall, events } = await summarizeInvitations(context.weddingId, side);
  return {
    overall: {
      households: overall.households,
      sent: overall.sent,
      opened: overall.opened,
      complete: overall.complete,
      partial: overall.partial,
      withoutEmail: overall.withoutEmail,
      notSent: overall.households - overall.sent,
      none: overall.households - overall.complete - overall.partial,
    },
    events: events.map((e) => ({
      eventId: e._id.toHexString(),
      invitedHouseholds: e.invitedHouseholds,
      invitedHeadcount: e.invitedHeadcount,
      respondedHouseholds: e.respondedHouseholds,
      attendingHouseholds: e.attendingHouseholds,
      attendingHeadcount: e.attendingHeadcount,
      declinedHouseholds: e.declinedHouseholds,
      pendingHouseholds: e.invitedHouseholds - e.respondedHouseholds,
    })),
    sideScope: side,
  };
}

const REPLY_LABELS = { attending: 'Attending', declined: 'Not attending' } as const;

/**
 * GET /api/weddings/{weddingId}/rsvp/export (api-spec §10.10): one row per family per invited
 * event, in the couple's event order, within the caller's side. Never includes links.
 */
export async function exportRsvps(token: string | undefined, weddingId: ObjectId): Promise<string> {
  const { context, side } = await readerOf(token, weddingId);
  const events = await listEvents(token, weddingId);
  const docs = await findInvitedHouseholds(context.weddingId, side);
  const rows: (string | number | null)[][] = [];
  for (const event of events) {
    for (const doc of docs) {
      const invited = doc.invitedEvents.find((e) => e.eventId.toHexString() === event.id);
      if (!invited) continue;
      const reply = doc.rsvps.find((r) => r.eventId.toHexString() === event.id);
      rows.push([
        event.name,
        event.date,
        doc.displayName,
        doc.side,
        invited.headcount,
        reply ? REPLY_LABELS[reply.status] : 'Waiting',
        reply ? reply.attendingCount : '',
        reply?.note ?? '',
        reply ? (reply.recordedBy === 'host' ? 'Host' : 'Guest') : '',
        reply?.updatedAt.toISOString() ?? '',
        doc.email,
        doc.phone,
      ]);
    }
  }
  return makeCsv([
    [
      'Event',
      'Event date',
      'Family',
      'Side',
      'Invited people',
      'Reply',
      'Attending people',
      'Note',
      'Recorded by',
      'Replied at',
      'Email',
      'Phone',
    ],
    ...rows,
  ]);
}

// Email sending (api-spec §10.4–10.7). The invitations module decides what to send and queues
// the emails; these functions choose the families and keep their invite status right.

export interface FamiliesToEmail {
  side: HouseholdSide | null;
  families: HouseholdDocument[];
  skippedNoEmail: number;
  skippedAlreadySent: number;
  skippedQueued: number;
  skippedNoEvents: number;
  skippedNotNeeded: number;
}

export type EmailSelection =
  | { householdIds: string[] }
  | { filter: string }
  /** Every family invited to this event (event-updated notices). */
  | { eventId: ObjectId };

type ChooseOptions = {
  resend?: boolean;
  dryRun?: boolean;
  /**
   * Families that already have this email waiting (read in this transaction), skipped as
   * "already being sent". Reminders and updates use it, since they don't change the invite status.
   */
  pending?: (weddingId: WeddingId, session: ClientSession) => Promise<Set<string>>;
};

type QueueFamilies = (args: {
  weddingId: WeddingId;
  chosen: FamiliesToEmail;
  session: ClientSession;
}) => Promise<void>;

/**
 * Choose the families to email, within `side`, and (unless `dryRun`) hand them to `queue` in
 * the same transaction, marking invitations "queued". Invitations skip families with no email,
 * no events, already queued, or already sent unless `resend`. Reminders and event updates go only
 * to families that were sent the invitation and have an email that hasn't bounced; reminders
 * also skip families that replied to every event or turned reminders off.
 */
async function chooseIn(
  {
    weddingId,
    side,
    session,
  }: { weddingId: WeddingId; side: HouseholdSide | null; session: ClientSession },
  kind: 'invite' | 'remind' | 'update',
  selection: EmailSelection,
  { resend = false, dryRun = false, pending }: ChooseOptions,
  queue: QueueFamilies,
  now: Date,
): Promise<FamiliesToEmail> {
  const filter: Filter<HouseholdDocument> =
    'eventId' in selection
      ? { 'invitedEvents.eventId': selection.eventId }
      : 'householdIds' in selection
        ? {
            _id: {
              $in: [...new Set(selection.householdIds.map((id) => id.toLowerCase()))].map(
                toObjectId,
              ),
            },
          }
        : kind === 'invite'
          ? { inviteStatus: { $in: ['not_sent', 'failed'] } }
          : { responseStatus: { $in: ['none', 'partial'] } };
  const candidates = await findForSending(weddingId, side, filter, session);
  const waiting = pending ? await pending(weddingId, session) : new Set<string>();
  const chosen: FamiliesToEmail = {
    side,
    families: [],
    skippedNoEmail: 0,
    skippedAlreadySent: 0,
    skippedQueued: 0,
    skippedNoEvents: 0,
    skippedNotNeeded: 0,
  };
  for (const doc of candidates) {
    const sent = doc.inviteStatus === 'sent' || doc.inviteStatus === 'sent_manually';
    if (!doc.email || doc.emailBounced) chosen.skippedNoEmail++;
    else if (doc.invitedEvents.length === 0) chosen.skippedNoEvents++;
    else if (doc.inviteStatus === 'queued' || waiting.has(doc._id.toHexString())) {
      chosen.skippedQueued++;
    } else if (kind === 'invite' && sent && !resend) chosen.skippedAlreadySent++;
    else if (
      kind === 'remind' &&
      (!sent || doc.responseStatus === 'complete' || doc.remindersOptOut)
    ) {
      chosen.skippedNotNeeded++;
    } else if (kind === 'update' && !sent) {
      // Never sent the invitation: they'll see the new details when it goes out.
      chosen.skippedNotNeeded++;
    } else chosen.families.push(doc);
  }
  if (dryRun || chosen.families.length === 0) return chosen;

  if (kind === 'invite') {
    await updateHouseholdsEach(
      weddingId,
      side,
      chosen.families.map((doc) => ({
        id: doc._id,
        set: { inviteStatus: 'queued' as const, updatedAt: now },
      })),
      session,
    );
  }
  await queue({ weddingId: weddingId, chosen, session });
  return chosen;
}

/** `chooseIn` for a team member's request: their side, under the wedding lock. */
export function chooseFamiliesToEmail(
  token: string | undefined,
  weddingId: ObjectId,
  kind: 'invite' | 'remind' | 'update',
  selection: EmailSelection,
  options: ChooseOptions,
  queue: QueueFamilies,
  now = new Date(),
): Promise<FamiliesToEmail> {
  return writeGuests(token, weddingId, ({ context, side, session }) =>
    chooseIn({ weddingId: context.weddingId, side, session }, kind, selection, options, queue, now),
  );
}

/**
 * `chooseIn` for the app's own scheduled work (automatic reminders): every side, under the
 * wedding lock. The caller has already chosen an active wedding.
 */
export function chooseFamiliesToEmailAsSystem(
  weddingId: WeddingId,
  kind: 'remind',
  selection: EmailSelection,
  options: ChooseOptions,
  queue: QueueFamilies,
  now = new Date(),
): Promise<FamiliesToEmail> {
  return withTransaction(async (session) => {
    await lockWeddingTasks(weddingId, session);
    return chooseIn({ weddingId, side: null, session }, kind, selection, options, queue, now);
  });
}

/** A family for an email job, or `null` if it was deleted meanwhile. */
export function getFamilyForEmail(weddingId: WeddingId, householdId: ObjectId) {
  return findHousehold(weddingId, null, householdId);
}

/** The invitation email went out: "Sent", keeping the first send time. */
export async function recordInvitationEmailed(
  weddingId: WeddingId,
  householdId: ObjectId,
  now = new Date(),
): Promise<void> {
  await updateHouseholdIf(weddingId, householdId, { sentAt: null }, { $set: { sentAt: now } });
  await updateHouseholdIf(
    weddingId,
    householdId,
    {},
    { $set: { inviteStatus: 'sent', updatedAt: now } },
  );
}

/** The invitation email couldn't be sent after every retry. */
export async function recordInvitationEmailFailed(
  weddingId: WeddingId,
  householdId: ObjectId,
  now = new Date(),
): Promise<void> {
  await updateHouseholdIf(
    weddingId,
    householdId,
    { inviteStatus: 'queued' },
    { $set: { inviteStatus: 'failed', updatedAt: now } },
  );
}

export async function recordReminded(
  weddingId: WeddingId,
  householdId: ObjectId,
  now = new Date(),
): Promise<void> {
  await updateHouseholdIf(
    weddingId,
    householdId,
    {},
    { $set: { lastRemindedAt: now, updatedAt: now }, $inc: { reminderCount: 1 } },
  );
}

/** A cancelled send: queued families go back to how they were before it. */
export async function restoreQueuedFamilies(
  weddingId: WeddingId,
  families: { householdId: ObjectId; previousStatus: HouseholdDocument['inviteStatus'] }[],
  session: ClientSession,
  now = new Date(),
): Promise<void> {
  for (const { householdId, previousStatus } of families) {
    await updateHouseholdIf(
      weddingId,
      householdId,
      { inviteStatus: 'queued' },
      { $set: { inviteStatus: previousStatus, updatedAt: now } },
      session,
    );
  }
}

/** The caller's side for invitation screens (batch progress and cancel). */
export async function invitationScope(token: string | undefined, weddingId: ObjectId) {
  const { context, side } = await readerOf(token, weddingId);
  return { context, side };
}

/** Same, for a change (cancel): a member of a wedding that isn't archived, in a transaction. */
export function withInvitationScope<T>(
  token: string | undefined,
  weddingId: ObjectId,
  fn: (args: {
    weddingId: WeddingId;
    side: HouseholdSide | null;
    session: ClientSession;
  }) => Promise<T>,
): Promise<T> {
  return writeGuests(token, weddingId, ({ context, side, session }) =>
    fn({ weddingId: context.weddingId, side, session }),
  );
}

/**
 * An email to this family bounced (Resend webhook, PRD NOTIF-2): flag it, unless the family's
 * address has been changed since, so no more emails are queued to it.
 */
export async function recordEmailBounced(
  weddingId: WeddingId,
  householdId: ObjectId,
  address: string,
  now = new Date(),
): Promise<void> {
  await updateHouseholdIf(
    weddingId,
    householdId,
    { email: address.toLowerCase() },
    { $set: { emailBounced: true, updatedAt: now } },
  );
}

/** The family marked an email as spam: no more reminders (they can still open their page). */
export async function recordEmailComplaint(
  weddingId: WeddingId,
  householdId: ObjectId,
  now = new Date(),
): Promise<void> {
  await updateHouseholdIf(
    weddingId,
    householdId,
    {},
    { $set: { remindersOptOut: true, updatedAt: now } },
  );
}
