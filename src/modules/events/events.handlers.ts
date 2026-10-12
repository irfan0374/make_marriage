import 'server-only';
import { z } from 'zod';
import { created, defineHandler, noContent, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import {
  addPresetEventsSchema,
  createEventSchema,
  deleteEventQuerySchema,
  reorderEventsSchema,
  updateEventSchema,
} from './events.schemas';
import {
  addPresetEvents,
  createEvent,
  deleteEvent,
  listEvents,
  reorderEvents,
  updateEvent,
} from './events.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });
const eventParams = z.strictObject({ weddingId: objectIdString, eventId: objectIdString });

// GET /api/weddings/{weddingId}/events (api-spec §8.1)
export const listEventsHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/events', params: weddingParams },
  async ({ request, params }) =>
    ok(await listEvents(readSessionToken(request), toObjectId(params.weddingId))),
);

// POST /api/weddings/{weddingId}/events (api-spec §8.2)
export const createEventHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/events', params: weddingParams, body: createEventSchema },
  async ({ request, params, body }) =>
    created(await createEvent(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// POST /api/weddings/{weddingId}/events/presets (api-spec §8.3)
export const addPresetEventsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/events/presets',
    params: weddingParams,
    body: addPresetEventsSchema,
  },
  async ({ request, params, body }) =>
    created(await addPresetEvents(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// PATCH /api/weddings/{weddingId}/events/{eventId} (api-spec §8.4)
export const updateEventHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/events/[eventId]',
    params: eventParams,
    body: updateEventSchema,
  },
  async ({ request, params, body }) => {
    const { event, meta } = await updateEvent(
      readSessionToken(request),
      toObjectId(params.weddingId),
      toObjectId(params.eventId),
      body,
    );
    return ok(event, { ...meta });
  },
);

// DELETE /api/weddings/{weddingId}/events/{eventId} (api-spec §8.5)
export const deleteEventHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/events/[eventId]',
    params: eventParams,
    query: deleteEventQuerySchema,
  },
  async ({ request, params, query }) => {
    await deleteEvent(
      readSessionToken(request),
      toObjectId(params.weddingId),
      toObjectId(params.eventId),
      query.confirm,
    );
    return noContent();
  },
);

// POST /api/weddings/{weddingId}/events/reorder (api-spec §8.6)
export const reorderEventsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/events/reorder',
    params: weddingParams,
    body: reorderEventsSchema,
  },
  async ({ request, params, body }) =>
    ok(
      await reorderEvents(
        readSessionToken(request),
        toObjectId(params.weddingId),
        body.eventIds.map(toObjectId),
      ),
    ),
);
