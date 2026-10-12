import 'server-only';
import type { ObjectId } from 'mongodb';
import { MAX_EVENTS_PER_WEDDING } from '@/config/constants';
import { AppError } from '@/lib/errors';
import { resolveWeddingContext } from '@/modules/members';
import { requireWritableWedding } from '@/modules/weddings';
import {
  countEvents,
  deleteEvent as deleteEventDoc,
  deleteEventsByIds,
  findEvent,
  insertEvents,
  listEvents as listEventDocs,
  setEventOrder,
  updateEvent as updateEventDoc,
} from './events.repository';
import { endTimeProblem, presetName } from './events.schemas';
import type {
  AddPresetEventsInput,
  CreateEventInput,
  EventChangeMeta,
  EventDocument,
  UpdateEventInput,
  WeddingEvent,
} from './events.types';

// Wedding events (api-spec §8, PRD SETUP-2 to SETUP-5). Every member of the wedding, Admin or
// Manager, can plan events; an archived wedding is read-only.

function toWeddingEvent(doc: EventDocument): WeddingEvent {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    presetKey: doc.presetKey,
    date: doc.date,
    startTime: doc.startTime,
    endTime: doc.endTime,
    venueName: doc.venueName,
    address: doc.address,
    mapUrl: doc.mapUrl,
    dressCode: doc.dressCode,
    notes: doc.notes,
    showOnWebsite: doc.showOnWebsite,
    order: doc.order,
  };
}

/** A member, in a wedding that isn't archived. */
async function requireEventWriter(token: string | undefined, weddingId: ObjectId) {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  return context;
}

/**
 * Households invited to an event. Guests and invitations aren't built yet, so none can be;
 * this becomes a households lookup with them (api-spec §8.4, §8.5).
 */
async function invitedHouseholdCount(): Promise<number> {
  return 0;
}

async function addEvents(
  token: string | undefined,
  weddingId: ObjectId,
  inputs: CreateEventInput[],
  now: Date,
): Promise<WeddingEvent[]> {
  const context = await requireEventWriter(token, weddingId);
  const existing = await countEvents(context.weddingId);
  if (existing + inputs.length > MAX_EVENTS_PER_WEDDING) throw new AppError('EVENT_LIMIT_REACHED');
  const docs = await insertEvents(context.weddingId, inputs, now);
  // Someone else may have added events at the same moment, past the check above. Counting again
  // after the insert catches that: whoever sees the wedding over the limit takes their own events
  // back, so the limit always holds. (If two adds overlap exactly, both may take theirs back;
  // trying again then works.)
  if ((await countEvents(context.weddingId)) > MAX_EVENTS_PER_WEDDING) {
    await deleteEventsByIds(
      context.weddingId,
      docs.map((doc) => doc._id),
    );
    throw new AppError('EVENT_LIMIT_REACHED');
  }
  return docs.map(toWeddingEvent);
}

export async function listEvents(
  token: string | undefined,
  weddingId: ObjectId,
): Promise<WeddingEvent[]> {
  const context = await resolveWeddingContext(token, weddingId);
  return (await listEventDocs(context.weddingId)).map(toWeddingEvent);
}

export async function createEvent(
  token: string | undefined,
  weddingId: ObjectId,
  input: CreateEventInput,
  now = new Date(),
): Promise<WeddingEvent> {
  const [event] = await addEvents(token, weddingId, [input], now);
  return event!;
}

/** Quick add: preset events with just a date and start time; details can follow. */
export function addPresetEvents(
  token: string | undefined,
  weddingId: ObjectId,
  input: AddPresetEventsInput,
  now = new Date(),
): Promise<WeddingEvent[]> {
  return addEvents(
    token,
    weddingId,
    input.events.map((preset) => ({
      name: presetName(preset.presetKey),
      presetKey: preset.presetKey,
      date: preset.date,
      startTime: preset.startTime,
      endTime: null,
      venueName: '',
      address: '',
      mapUrl: null,
      dressCode: '',
      notes: '',
      showOnWebsite: true,
    })),
    now,
  );
}

export async function updateEvent(
  token: string | undefined,
  weddingId: ObjectId,
  eventId: ObjectId,
  changes: UpdateEventInput,
  now = new Date(),
): Promise<{ event: WeddingEvent; meta: EventChangeMeta }> {
  const context = await requireEventWriter(token, weddingId);
  const current = await findEvent(context.weddingId, eventId);
  if (!current) throw new AppError('NOT_FOUND');

  // The end time is checked against the start time it will have after the change.
  if (changes.startTime !== undefined || changes.endTime !== undefined) {
    const message = endTimeProblem(
      changes.startTime ?? current.startTime,
      changes.endTime !== undefined ? changes.endTime : current.endTime,
    );
    if (message) {
      throw new AppError('VALIDATION_ERROR', undefined, {
        details: [{ path: 'endTime', message }],
      });
    }
  }

  const updated = await updateEventDoc(context.weddingId, eventId, changes, now);
  if (!updated) throw new AppError('NOT_FOUND');

  const guestFacing = (['date', 'startTime', 'endTime', 'venueName', 'address'] as const).some(
    (field) => changes[field] !== undefined && changes[field] !== current[field],
  );
  // Families can only be told once invitations exist (api-spec §10.8).
  const affectedHouseholds = guestFacing ? await invitedHouseholdCount() : 0;
  return {
    event: toWeddingEvent(updated),
    meta: { guestFacingChange: affectedHouseholds > 0, affectedHouseholds },
  };
}

/**
 * Delete an event. When families are invited to it, the caller must confirm, because their
 * replies for it go (api-spec §8.5). Linked tasks, expenses, vendors and photos are unlinked
 * by those modules once they exist.
 */
export async function deleteEvent(
  token: string | undefined,
  weddingId: ObjectId,
  eventId: ObjectId,
  confirm: boolean,
): Promise<void> {
  const context = await requireEventWriter(token, weddingId);
  if (!(await findEvent(context.weddingId, eventId))) throw new AppError('NOT_FOUND');
  const affectedHouseholds = await invitedHouseholdCount();
  if (affectedHouseholds > 0 && !confirm) {
    throw new AppError('CONFIRMATION_REQUIRED', undefined, { details: { affectedHouseholds } });
  }
  if (!(await deleteEventDoc(context.weddingId, eventId))) throw new AppError('NOT_FOUND');
}

/**
 * Save a new order. The list must name every event exactly once; if someone added or deleted
 * an event meanwhile, it's a CONFLICT and the page reloads the list.
 */
export async function reorderEvents(
  token: string | undefined,
  weddingId: ObjectId,
  eventIds: ObjectId[],
  now = new Date(),
): Promise<WeddingEvent[]> {
  const context = await requireEventWriter(token, weddingId);
  const current = await listEventDocs(context.weddingId);
  const known = new Set(current.map((doc) => doc._id.toHexString()));
  const complete =
    eventIds.length === current.length && eventIds.every((id) => known.has(id.toHexString()));
  if (!complete) throw new AppError('CONFLICT', 'The events changed. Reload and try again.');
  await setEventOrder(context.weddingId, eventIds, now);
  return (await listEventDocs(context.weddingId)).map(toWeddingEvent);
}
