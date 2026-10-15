import 'server-only';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { defineHandler, list, noContent, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { clientInfo, readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import {
  bulkPhotosSchema,
  completeUploadsSchema,
  downloadUrlsSchema,
  listPhotosQuerySchema,
  publicPhotosQuerySchema,
  qrQuerySchema,
  updateGallerySchema,
  updatePhotoSchema,
  uploadRequestSchema,
} from './gallery.schemas';
import {
  bulkPhotos,
  completeTeamUploads,
  completeUploads,
  createTeamUploads,
  createUploads,
  downloadUrls,
  deletePhoto,
  fingerprintOf,
  galleryQrCode,
  getGallery,
  getPublicGallery,
  listPhotos,
  listPublicPhotos,
  regenerateGalleryLink,
  updateGallery,
  updatePhoto,
} from './gallery.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });
const photoParams = z.strictObject({ weddingId: objectIdString, photoId: objectIdString });
const tokenParams = z.strictObject({ token: z.string().max(100) });

/** The visitor, hashed: their IP and browser (never stored raw). */
const visitor = (request: NextRequest) => {
  const { ip, userAgent } = clientInfo(request);
  return fingerprintOf(ip, userAgent);
};

// GET /api/weddings/{weddingId}/gallery (api-spec §19.1)
export const getGalleryHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/gallery', params: weddingParams },
  async ({ request, params }) =>
    ok(await getGallery(readSessionToken(request), toObjectId(params.weddingId))),
);

// PATCH /api/weddings/{weddingId}/gallery
export const updateGalleryHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/gallery', params: weddingParams, body: updateGallerySchema },
  async ({ request, params, body }) =>
    ok(await updateGallery(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// POST /api/weddings/{weddingId}/gallery/regenerate-link
export const regenerateLinkHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/gallery/regenerate-link', params: weddingParams },
  async ({ request, params }) =>
    ok(await regenerateGalleryLink(readSessionToken(request), toObjectId(params.weddingId))),
);

// GET /api/weddings/{weddingId}/gallery/qr?format=png|svg
export const galleryQrHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/gallery/qr', params: weddingParams, query: qrQuerySchema },
  async ({ request, params, query }) => {
    const qr = await galleryQrCode(
      readSessionToken(request),
      toObjectId(params.weddingId),
      query.format,
    );
    return new Response(qr.body as BodyInit, {
      headers: {
        'content-type': qr.contentType,
        'content-disposition': `inline; filename="${qr.fileName}"`,
        'cache-control': 'private, no-store',
      },
    });
  },
);

// GET /api/weddings/{weddingId}/gallery/photos
export const listPhotosHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/gallery/photos',
    params: weddingParams,
    query: listPhotosQuerySchema,
  },
  async ({ request, params, query }) => {
    const page = await listPhotos(readSessionToken(request), toObjectId(params.weddingId), query);
    return list(page.photos, { nextCursor: page.nextCursor });
  },
);

// PATCH /api/weddings/{weddingId}/gallery/photos/{photoId}
export const updatePhotoHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/gallery/photos/[photoId]',
    params: photoParams,
    body: updatePhotoSchema,
  },
  async ({ request, params, body }) =>
    ok(
      await updatePhoto(
        readSessionToken(request),
        toObjectId(params.weddingId),
        toObjectId(params.photoId),
        body,
      ),
    ),
);

// DELETE /api/weddings/{weddingId}/gallery/photos/{photoId}
export const deletePhotoHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/gallery/photos/[photoId]', params: photoParams },
  async ({ request, params }) => {
    await deletePhoto(
      readSessionToken(request),
      toObjectId(params.weddingId),
      toObjectId(params.photoId),
    );
    return noContent();
  },
);

// POST /api/weddings/{weddingId}/gallery/photos/bulk
export const bulkPhotosHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/gallery/photos/bulk',
    params: weddingParams,
    body: bulkPhotosSchema,
  },
  async ({ request, params, body }) =>
    ok(await bulkPhotos(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// GET /api/public/gallery/{token} (api-spec §19.2)
export const getPublicGalleryHandler = defineHandler(
  { route: '/api/public/gallery/[token]', params: tokenParams },
  async ({ request, params }) => ok(await getPublicGallery(params.token, visitor(request))),
);

// GET /api/public/gallery/{token}/photos
export const listPublicPhotosHandler = defineHandler(
  {
    route: '/api/public/gallery/[token]/photos',
    params: tokenParams,
    query: publicPhotosQuerySchema,
  },
  async ({ request, params, query }) => {
    const page = await listPublicPhotos(params.token, visitor(request), query);
    return list(page.photos, { nextCursor: page.nextCursor });
  },
);

// POST /api/public/gallery/{token}/uploads
export const createUploadsHandler = defineHandler(
  { route: '/api/public/gallery/[token]/uploads', params: tokenParams, body: uploadRequestSchema },
  async ({ request, params, body }) =>
    ok(await createUploads(params.token, visitor(request), body)),
);

// POST /api/public/gallery/{token}/uploads/complete
export const completeUploadsHandler = defineHandler(
  {
    route: '/api/public/gallery/[token]/uploads/complete',
    params: tokenParams,
    body: completeUploadsSchema,
  },
  async ({ request, params, body }) =>
    ok(await completeUploads(params.token, visitor(request), body)),
);

// POST /api/weddings/{weddingId}/gallery/uploads (api-spec §19.1)
export const createTeamUploadsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/gallery/uploads',
    params: weddingParams,
    body: uploadRequestSchema,
  },
  async ({ request, params, body }) =>
    ok(await createTeamUploads(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// POST /api/weddings/{weddingId}/gallery/uploads/complete
export const completeTeamUploadsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/gallery/uploads/complete',
    params: weddingParams,
    body: completeUploadsSchema,
  },
  async ({ request, params, body }) =>
    ok(await completeTeamUploads(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// POST /api/weddings/{weddingId}/gallery/download-urls (api-spec §19.1)
export const downloadUrlsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/gallery/download-urls',
    params: weddingParams,
    body: downloadUrlsSchema,
  },
  async ({ request, params, body }) => {
    const part = await downloadUrls(readSessionToken(request), toObjectId(params.weddingId), body);
    return ok(part.files, {
      nextCursor: part.nextCursor,
      part: part.part,
      totalParts: part.totalParts,
    });
  },
);
