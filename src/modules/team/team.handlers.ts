import 'server-only';
import { z } from 'zod';
import { created, defineHandler, noContent, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import { changeMemberSchema, createInviteSchema, inviteTokenSchema } from './team.schemas';
import {
  acceptInvite,
  cancelInvite,
  changeMember,
  createInvite,
  getTeam,
  previewInvite,
  removeMember,
  renewInvite,
} from './team.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });
const inviteParams = z.strictObject({ weddingId: objectIdString, inviteId: objectIdString });
const memberParams = z.strictObject({ weddingId: objectIdString, memberId: objectIdString });
const tokenParams = z.strictObject({ token: inviteTokenSchema });

// GET /api/weddings/{weddingId}/members (api-spec §7.1)
export const getTeamHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/members', params: weddingParams },
  async ({ request, params }) =>
    ok(await getTeam(readSessionToken(request), toObjectId(params.weddingId))),
);

// POST /api/weddings/{weddingId}/members/invites (api-spec §7.2). Admins only.
export const createInviteHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/members/invites',
    params: weddingParams,
    body: createInviteSchema,
  },
  async ({ request, params, body }) =>
    created(await createInvite(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// POST /api/weddings/{weddingId}/members/invites/{inviteId}/resend (api-spec §7.3). Admins only.
export const renewInviteHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/members/invites/[inviteId]/resend', params: inviteParams },
  async ({ request, params }) =>
    ok(
      await renewInvite(
        readSessionToken(request),
        toObjectId(params.weddingId),
        toObjectId(params.inviteId),
      ),
    ),
);

// DELETE /api/weddings/{weddingId}/members/invites/{inviteId} (api-spec §7.4). Admins only.
export const cancelInviteHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/members/invites/[inviteId]', params: inviteParams },
  async ({ request, params }) => {
    await cancelInvite(
      readSessionToken(request),
      toObjectId(params.weddingId),
      toObjectId(params.inviteId),
    );
    return noContent();
  },
);

// PATCH /api/weddings/{weddingId}/members/{memberId} (api-spec §7.5). Admins only.
export const changeMemberHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/members/[memberId]',
    params: memberParams,
    body: changeMemberSchema,
  },
  async ({ request, params, body }) =>
    ok(
      await changeMember(
        readSessionToken(request),
        toObjectId(params.weddingId),
        toObjectId(params.memberId),
        body,
      ),
    ),
);

// DELETE /api/weddings/{weddingId}/members/{memberId} (api-spec §7.6). Admins only.
export const removeMemberHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/members/[memberId]', params: memberParams },
  async ({ request, params }) => {
    await removeMember(
      readSessionToken(request),
      toObjectId(params.weddingId),
      toObjectId(params.memberId),
    );
    return noContent();
  },
);

// GET /api/member-invites/{token} (api-spec §7.8). Public: the link itself is the key.
export const previewInviteHandler = defineHandler(
  { route: '/api/member-invites/[token]', params: tokenParams },
  async ({ params }) => ok(await previewInvite(params.token)),
);

// POST /api/member-invites/{token}/accept (api-spec §7.9). Logged in, email must match.
export const acceptInviteHandler = defineHandler(
  { route: '/api/member-invites/[token]/accept', params: tokenParams },
  async ({ request, params }) => ok(await acceptInvite(readSessionToken(request), params.token)),
);
