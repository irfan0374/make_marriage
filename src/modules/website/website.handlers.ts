import 'server-only';
import { z } from 'zod';
import { defineHandler, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import { changeSlugSchema, slugCheckQuerySchema, updateWebsiteSchema } from './website.schemas';
import {
  changeSlug,
  checkSlug,
  getPublicSiteOrThrow,
  getWebsite,
  setPublished,
  siteImageUrl,
  updateWebsite,
} from './website.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });
const siteParams = z.strictObject({ slug: z.string().max(100) });
const imageParams = z.strictObject({ slug: z.string().max(100), file: z.string().max(100) });

// GET /api/weddings/{weddingId}/website (api-spec §17.1)
export const getWebsiteHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/website', params: weddingParams },
  async ({ request, params }) =>
    ok(await getWebsite(readSessionToken(request), toObjectId(params.weddingId))),
);

// PATCH /api/weddings/{weddingId}/website (api-spec §17.2)
export const updateWebsiteHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/website', params: weddingParams, body: updateWebsiteSchema },
  async ({ request, params, body }) =>
    ok(await updateWebsite(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// GET /api/weddings/{weddingId}/website/slug-check (api-spec §17.3)
export const checkSlugHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/website/slug-check',
    params: weddingParams,
    query: slugCheckQuerySchema,
  },
  async ({ request, params, query }) =>
    ok(await checkSlug(readSessionToken(request), toObjectId(params.weddingId), query.slug)),
);

// PUT /api/weddings/{weddingId}/website/slug (api-spec §17.4)
export const changeSlugHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/website/slug',
    params: weddingParams,
    body: changeSlugSchema,
  },
  async ({ request, params, body }) =>
    ok(await changeSlug(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// POST /api/weddings/{weddingId}/website/publish (api-spec §17.5)
export const publishWebsiteHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/website/publish', params: weddingParams },
  async ({ request, params }) =>
    ok(await setPublished(readSessionToken(request), toObjectId(params.weddingId), true)),
);

// POST /api/weddings/{weddingId}/website/unpublish (api-spec §17.5)
export const unpublishWebsiteHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/website/unpublish', params: weddingParams },
  async ({ request, params }) =>
    ok(await setPublished(readSessionToken(request), toObjectId(params.weddingId), false)),
);

// GET /api/public/sites/{slug} (api-spec §18.1)
export const getPublicSiteHandler = defineHandler(
  { route: '/api/public/sites/[slug]', params: siteParams },
  async ({ params }) => ok(await getPublicSiteOrThrow(params.slug)),
);

// GET /api/public/sites/{slug}/images/{file} (api-spec §18.2)
export const siteImageHandler = defineHandler(
  { route: '/api/public/sites/[slug]/images/[file]', params: imageParams },
  async ({ request, params }) =>
    new Response(null, {
      status: 302,
      headers: {
        location: await siteImageUrl(readSessionToken(request), params.slug, params.file),
        // Shorter than the signed link's hour, so a cached redirect never points at an expired one.
        'cache-control': 'private, max-age=1800',
      },
    }),
);
