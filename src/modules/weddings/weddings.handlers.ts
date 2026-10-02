import 'server-only';
import { z } from 'zod';
import { created, defineHandler, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import { createWeddingSchema, updateWeddingSchema } from './weddings.schemas';
import { createWedding, getMe, getWedding, updateWedding } from './weddings.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });

// POST /api/weddings (api-spec §6.1)
export const createWeddingHandler = defineHandler(
  { route: '/api/weddings', body: createWeddingSchema },
  async ({ request, body }) => created(await createWedding(readSessionToken(request), body)),
);

// GET /api/weddings/{weddingId} (api-spec §6.2)
export const getWeddingHandler = defineHandler(
  { route: '/api/weddings/[weddingId]', params: weddingParams },
  async ({ request, params }) =>
    ok(await getWedding(readSessionToken(request), toObjectId(params.weddingId))),
);

// PATCH /api/weddings/{weddingId} (api-spec §6.3). Admins only.
export const updateWeddingHandler = defineHandler(
  { route: '/api/weddings/[weddingId]', params: weddingParams, body: updateWeddingSchema },
  async ({ request, params, body }) =>
    ok(await updateWedding(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// GET /api/me (api-spec §5.7). Lives here, not in auth, because it lists the user's weddings
// and auth must not depend on the modules built on top of it.
export const getMeHandler = defineHandler({ route: '/api/me' }, async ({ request }) =>
  ok(await getMe(readSessionToken(request))),
);
