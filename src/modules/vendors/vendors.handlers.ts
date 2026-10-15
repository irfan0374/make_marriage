import 'server-only';
import { z } from 'zod';
import { created, defineHandler, noContent, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import {
  addAttachmentSchema,
  createVendorSchema,
  listVendorsQuerySchema,
  updateVendorSchema,
} from './vendors.schemas';
import {
  addVendorAttachment,
  createVendor,
  deleteVendor,
  getVendor,
  listVendors,
  removeVendorAttachment,
  updateVendorDetails,
  vendorAttachmentUrl,
} from './vendors.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });
const vendorParams = z.strictObject({ weddingId: objectIdString, vendorId: objectIdString });
const attachmentParams = z.strictObject({
  weddingId: objectIdString,
  vendorId: objectIdString,
  attachmentId: objectIdString,
});

const ids = (p: { weddingId: string; vendorId: string }) =>
  [toObjectId(p.weddingId), toObjectId(p.vendorId)] as const;

// GET /api/weddings/{weddingId}/vendors (api-spec §14.1)
export const listVendorsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/vendors',
    params: weddingParams,
    query: listVendorsQuerySchema,
  },
  async ({ request, params, query }) =>
    ok(await listVendors(readSessionToken(request), toObjectId(params.weddingId), query)),
);

// POST /api/weddings/{weddingId}/vendors (api-spec §14.2)
export const createVendorHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/vendors', params: weddingParams, body: createVendorSchema },
  async ({ request, params, body }) =>
    created(await createVendor(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// GET /api/weddings/{weddingId}/vendors/{vendorId} (api-spec §14.3)
export const getVendorHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/vendors/[vendorId]', params: vendorParams },
  async ({ request, params }) => ok(await getVendor(readSessionToken(request), ...ids(params))),
);

// PATCH /api/weddings/{weddingId}/vendors/{vendorId} (api-spec §14.4)
export const updateVendorHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/vendors/[vendorId]',
    params: vendorParams,
    body: updateVendorSchema,
  },
  async ({ request, params, body }) =>
    ok(await updateVendorDetails(readSessionToken(request), ...ids(params), body)),
);

// DELETE /api/weddings/{weddingId}/vendors/{vendorId} (api-spec §14.5)
export const deleteVendorHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/vendors/[vendorId]', params: vendorParams },
  async ({ request, params }) => {
    await deleteVendor(readSessionToken(request), ...ids(params));
    return noContent();
  },
);

// POST /api/weddings/{weddingId}/vendors/{vendorId}/attachments (api-spec §14.6)
export const addAttachmentHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/vendors/[vendorId]/attachments',
    params: vendorParams,
    body: addAttachmentSchema,
  },
  async ({ request, params, body }) =>
    created(await addVendorAttachment(readSessionToken(request), ...ids(params), body)),
);

// GET /api/weddings/{weddingId}/vendors/{vendorId}/attachments/{attachmentId} (api-spec §14.8)
export const openAttachmentHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/vendors/[vendorId]/attachments/[attachmentId]',
    params: attachmentParams,
  },
  async ({ request, params }) => {
    const url = await vendorAttachmentUrl(
      readSessionToken(request),
      ...ids(params),
      toObjectId(params.attachmentId),
    );
    return new Response(null, {
      status: 302,
      headers: { location: url, 'cache-control': 'no-store' },
    });
  },
);

// DELETE /api/weddings/{weddingId}/vendors/{vendorId}/attachments/{attachmentId} (api-spec §14.7)
export const removeAttachmentHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/vendors/[vendorId]/attachments/[attachmentId]',
    params: attachmentParams,
  },
  async ({ request, params }) => {
    await removeVendorAttachment(
      readSessionToken(request),
      ...ids(params),
      toObjectId(params.attachmentId),
    );
    return noContent();
  },
);
