import { makeCsv } from '@/shared/csv';
import 'server-only';
import { z } from 'zod';
import { created, defineHandler, list, noContent, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import {
  importHouseholdsSchema,
  bulkHouseholdsSchema,
  createHouseholdSchema,
  duplicatesQuerySchema,
  listHouseholdsQuerySchema,
  updateHouseholdSchema,
} from './households.schemas';
import {
  importHouseholds,
  exportHouseholds,
  bulkUpdateHouseholds,
  createHousehold,
  deleteHousehold,
  findPossibleDuplicates,
  getHousehold,
  getHouseholdSummary,
  listHouseholds,
  updateHouseholdDetails,
} from './households.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });
const householdParams = z.strictObject({
  weddingId: objectIdString,
  householdId: objectIdString,
});

// GET /api/weddings/{weddingId}/households (api-spec §9.1)
export const listHouseholdsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/households',
    params: weddingParams,
    query: listHouseholdsQuerySchema,
  },
  async ({ request, params, query }) => {
    const { households, nextCursor, total } = await listHouseholds(
      readSessionToken(request),
      toObjectId(params.weddingId),
      query,
    );
    return list(households, { nextCursor, total });
  },
);

// POST /api/weddings/{weddingId}/households (api-spec §9.2)
export const createHouseholdHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/households',
    params: weddingParams,
    body: createHouseholdSchema,
  },
  async ({ request, params, body }) =>
    created(await createHousehold(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// GET /api/weddings/{weddingId}/households/summary (api-spec §9.15)
export const householdSummaryHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/households/summary', params: weddingParams },
  async ({ request, params }) =>
    ok(await getHouseholdSummary(readSessionToken(request), toObjectId(params.weddingId))),
);

// GET /api/weddings/{weddingId}/households/duplicates (api-spec §9.14)
export const householdDuplicatesHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/households/duplicates',
    params: weddingParams,
    query: duplicatesQuerySchema,
  },
  async ({ request, params, query }) =>
    ok(
      await findPossibleDuplicates(readSessionToken(request), toObjectId(params.weddingId), query),
    ),
);

// POST /api/weddings/{weddingId}/households/bulk (api-spec §9.8)
export const bulkHouseholdsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/households/bulk',
    params: weddingParams,
    body: bulkHouseholdsSchema,
  },
  async ({ request, params, body }) =>
    ok(await bulkUpdateHouseholds(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// GET /api/weddings/{weddingId}/households/{householdId} (api-spec §9.3)
export const getHouseholdHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/households/[householdId]', params: householdParams },
  async ({ request, params }) =>
    ok(
      await getHousehold(
        readSessionToken(request),
        toObjectId(params.weddingId),
        toObjectId(params.householdId),
      ),
    ),
);

// PATCH /api/weddings/{weddingId}/households/{householdId} (api-spec §9.4)
export const updateHouseholdHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/households/[householdId]',
    params: householdParams,
    body: updateHouseholdSchema,
  },
  async ({ request, params, body }) =>
    ok(
      await updateHouseholdDetails(
        readSessionToken(request),
        toObjectId(params.weddingId),
        toObjectId(params.householdId),
        body,
      ),
    ),
);

// DELETE /api/weddings/{weddingId}/households/{householdId} (api-spec §9.5)
export const deleteHouseholdHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/households/[householdId]', params: householdParams },
  async ({ request, params }) => {
    await deleteHousehold(
      readSessionToken(request),
      toObjectId(params.weddingId),
      toObjectId(params.householdId),
    );
    return noContent();
  },
);

function csvDownload(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export const importHouseholdsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/households/import',
    params: weddingParams,
    body: importHouseholdsSchema,
  },
  async ({ request, params, body }) =>
    ok(await importHouseholds(readSessionToken(request), toObjectId(params.weddingId), body)),
);

export const exportHouseholdsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/households/export',
    params: weddingParams,
    query: listHouseholdsQuerySchema,
  },
  async ({ request, params, query }) =>
    csvDownload(
      await exportHouseholds(readSessionToken(request), toObjectId(params.weddingId), query),
      'guest-families.csv',
    ),
);

export const importTemplateHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/households/import-template', params: weddingParams },
  async ({ request, params }) => {
    const summary = await getHouseholdSummary(
      readSessionToken(request),
      toObjectId(params.weddingId),
    );
    return csvDownload(
      makeCsv([
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
        ],
        [
          'Example family',
          'Anu; Ravi',
          2,
          'family@example.com',
          '+919876543210',
          summary.sideScope ?? 'bride',
          'Family',
          '',
          '',
        ],
      ]),
      'guest-import-template.csv',
    );
  },
);
