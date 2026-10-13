import 'server-only';
import { z } from 'zod';
import { defineHandler, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import { presignFileSchema } from './files.schemas';
import { presignFileUpload } from './files.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });

// POST /api/weddings/{weddingId}/files/presign (api-spec §15.2)
export const presignFileHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/files/presign',
    params: weddingParams,
    body: presignFileSchema,
  },
  async ({ request, params, body }) =>
    ok(await presignFileUpload(readSessionToken(request), toObjectId(params.weddingId), body)),
);
