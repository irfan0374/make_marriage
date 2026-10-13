import 'server-only';
import { z } from 'zod';
import { accepted, defineHandler, noContent, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { guestRsvpSchema } from '@/modules/households/households.schemas';
import { objectIdString } from '@/shared/validation';
import {
  batchIdSchema,
  remindFamiliesSchema,
  sendInvitationsSchema,
  updateInvitationSchema,
} from './invitations.schemas';
import {
  cancelSendBatch,
  getGuestInvitation,
  getSendBatch,
  invitationCardUrl,
  listSendBatches,
  remindFamilies,
  sendInvitations,
  getInvitationSettings,
  invitationCalendar,
  recordInvitationOpened,
  replyToInvitation,
  sendTestInvitation,
  stopReminders,
  updateInvitation,
} from './invitations.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });
// Personal links are 22 URL-safe characters; anything else can't be one.
// Any short string is looked up, so every unknown link (mistyped, cut short or replaced) gets
// the same LINK_INVALID answer (api-spec §11.1) rather than a generic 404.
const linkToken = z.string().min(1).max(64);
const linkParams = z.strictObject({ token: linkToken });
const calendarParams = z.strictObject({ token: linkToken, eventId: objectIdString });
const batchParams = z.strictObject({ weddingId: objectIdString, batchId: batchIdSchema });

/** Guest responses are personal: never cached by browsers or proxies. */
function privateResponse(response: Response): Response {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

// GET /api/weddings/{weddingId}/invitation (api-spec §10.1)
export const getInvitationHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/invitation', params: weddingParams },
  async ({ request, params }) =>
    ok(await getInvitationSettings(readSessionToken(request), toObjectId(params.weddingId))),
);

// PUT /api/weddings/{weddingId}/invitation (api-spec §10.2)
export const updateInvitationHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/invitation',
    params: weddingParams,
    body: updateInvitationSchema,
  },
  async ({ request, params, body }) =>
    ok(await updateInvitation(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// POST /api/weddings/{weddingId}/invitation/test (api-spec §10.3)
export const testInvitationHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/invitation/test', params: weddingParams },
  async ({ request, params }) =>
    ok(await sendTestInvitation(readSessionToken(request), toObjectId(params.weddingId))),
);

// GET /api/public/invitations/{token} (api-spec §11.1)
export const publicInvitationHandler = defineHandler(
  { route: '/api/public/invitations/[token]', params: linkParams },
  async ({ params }) => privateResponse(ok(await getGuestInvitation(params.token))),
);

// PUT /api/public/invitations/{token}/rsvp (api-spec §11.2)
export const publicRsvpHandler = defineHandler(
  { route: '/api/public/invitations/[token]/rsvp', params: linkParams, body: guestRsvpSchema },
  async ({ params, body }) => privateResponse(ok(await replyToInvitation(params.token, body))),
);

// GET /api/public/invitations/{token}/events/{eventId}/calendar.ics (api-spec §11.3)
export const publicCalendarHandler = defineHandler(
  {
    route: '/api/public/invitations/[token]/events/[eventId]/calendar.ics',
    params: calendarParams,
  },
  async ({ params }) => {
    const { filename, ics } = await invitationCalendar(params.token, toObjectId(params.eventId));
    return privateResponse(
      new Response(ics, {
        headers: {
          'content-type': 'text/calendar; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
          'x-content-type-options': 'nosniff',
        },
      }),
    );
  },
);

// POST /api/public/invitations/{token}/stop-reminders (api-spec §11.4)
export const publicStopRemindersHandler = defineHandler(
  { route: '/api/public/invitations/[token]/stop-reminders', params: linkParams },
  async ({ params }) => {
    await stopReminders(params.token);
    return noContent();
  },
);

// POST /api/public/invitations/{token}/opened (api-spec §11.5)
export const publicOpenedHandler = defineHandler(
  { route: '/api/public/invitations/[token]/opened', params: linkParams },
  async ({ request, params }) => {
    await recordInvitationOpened(params.token, request.headers.get('user-agent'));
    return noContent();
  },
);

// POST /api/weddings/{weddingId}/invitation/send (api-spec §10.4)
export const sendInvitationsHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/invitation/send',
    params: weddingParams,
    body: sendInvitationsSchema,
  },
  async ({ request, params, body }) => {
    const result = await sendInvitations(
      readSessionToken(request),
      toObjectId(params.weddingId),
      body,
    );
    return result.batchId ? accepted(result) : ok(result);
  },
);

// POST /api/weddings/{weddingId}/invitation/remind (api-spec §10.7)
export const remindFamiliesHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/invitation/remind',
    params: weddingParams,
    body: remindFamiliesSchema,
  },
  async ({ request, params, body }) => {
    const result = await remindFamilies(
      readSessionToken(request),
      toObjectId(params.weddingId),
      body,
    );
    return result.batchId ? accepted(result) : ok(result);
  },
);

// GET /api/weddings/{weddingId}/invitation/batches (api-spec §10.5)
export const listBatchesHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/invitation/batches', params: weddingParams },
  async ({ request, params }) =>
    ok(await listSendBatches(readSessionToken(request), toObjectId(params.weddingId))),
);

// GET /api/weddings/{weddingId}/invitation/batches/{batchId} (api-spec §10.5)
export const getBatchHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/invitation/batches/[batchId]', params: batchParams },
  async ({ request, params }) =>
    ok(await getSendBatch(readSessionToken(request), toObjectId(params.weddingId), params.batchId)),
);

// POST /api/weddings/{weddingId}/invitation/batches/{batchId}/cancel (api-spec §10.6)
export const cancelBatchHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/invitation/batches/[batchId]/cancel', params: batchParams },
  async ({ request, params }) =>
    ok(
      await cancelSendBatch(
        readSessionToken(request),
        toObjectId(params.weddingId),
        params.batchId,
      ),
    ),
);

// GET /api/public/invitations/{token}/card: the card image in emails (api-spec §11.6)
export const publicCardHandler = defineHandler(
  { route: '/api/public/invitations/[token]/card', params: linkParams },
  async ({ params }) =>
    privateResponse(
      new Response(null, {
        status: 302,
        headers: { location: await invitationCardUrl(params.token) },
      }),
    ),
);
