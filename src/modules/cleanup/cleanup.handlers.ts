import 'server-only';
import { z } from 'zod';
import { defineHandler, noContent } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { deleteEventQuerySchema } from '@/modules/events/events.schemas';
import { objectIdString } from '@/shared/validation';
import { deleteEvent } from './cleanup.service';

const eventParams = z.strictObject({ weddingId: objectIdString, eventId: objectIdString });

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
