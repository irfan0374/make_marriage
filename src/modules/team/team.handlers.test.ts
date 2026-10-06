import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import {
  acceptInviteHandler,
  cancelInviteHandler,
  changeMemberHandler,
  createInviteHandler,
  getTeamHandler,
  previewInviteHandler,
  renewInviteHandler,
} from './team.handlers';
import * as service from './team.service';

// The team routes stay thin: they check the request and pass it on. Permissions and the
// admin rules are tested end to end in tests/integration/team.test.ts.

vi.mock('./team.service', () => ({
  acceptInvite: vi.fn(),
  cancelInvite: vi.fn(),
  changeMember: vi.fn(),
  createInvite: vi.fn(),
  getTeam: vi.fn(),
  previewInvite: vi.fn(),
  renewInvite: vi.fn(),
}));

const weddingId = '66f1b0000000000000000001';
const inviteId = '66f1b0000000000000000002';
const memberId = '66f1b0000000000000000003';
const token = 'a'.repeat(43);
const cookie = 'mmm_session=raw-token';

function request(method: string, path: string, body?: unknown, origin = 'http://localhost') {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin, cookie },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const invitesPath = `/api/weddings/${weddingId}/members/invites`;
const createInvite = (body: unknown, origin?: string, id = weddingId) =>
  createInviteHandler(request('POST', invitesPath, body, origin), params({ weddingId: id }));

beforeEach(() => vi.clearAllMocks());

describe('POST /api/weddings/{weddingId}/members/invites', () => {
  it('passes the parsed invite to the service and returns 201', async () => {
    const link = { invite: { id: inviteId }, inviteLink: 'x', emailSent: true };
    vi.mocked(service.createInvite).mockResolvedValueOnce(link as never);
    const res = await createInvite({ email: '  Uncle@Example.com ', role: 'manager' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: link });
    const [sessionToken, id, input] = vi.mocked(service.createInvite).mock.calls[0]!;
    expect(sessionToken).toBe('raw-token');
    expect(id.toHexString()).toBe(weddingId);
    // Emails are trimmed and lowercased; the side defaults to both.
    expect(input).toEqual({ email: 'uncle@example.com', role: 'manager', sideScope: 'both' });
  });

  it('returns field errors for a bad email, role or unknown field without calling the service', async () => {
    const res = await createInvite({ email: 'not-an-email', role: 'owner', extra: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    expect(service.createInvite).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed wedding id without calling the service', async () => {
    const res = await createInvite({ email: 'a@example.com', role: 'manager' }, undefined, 'nope');
    expect(res.status).toBe(404);
    expect(service.createInvite).not.toHaveBeenCalled();
  });

  it('rejects requests from another site', async () => {
    const res = await createInvite(
      { email: 'a@example.com', role: 'manager' },
      'https://evil.example',
    );
    expect(res.status).toBe(403);
    expect(service.createInvite).not.toHaveBeenCalled();
  });

  it('passes through errors from the service', async () => {
    vi.mocked(service.createInvite).mockRejectedValueOnce(new AppError('ADMIN_LIMIT_REACHED'));
    const res = await createInvite({ email: 'a@example.com', role: 'admin' });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('ADMIN_LIMIT_REACHED');
  });
});

describe('GET /api/weddings/{weddingId}/members', () => {
  it('returns the team, and 404 for a malformed id', async () => {
    vi.mocked(service.getTeam).mockResolvedValueOnce({ members: [], pendingInvites: null });
    const ok = await getTeamHandler(
      request('GET', `/api/weddings/${weddingId}/members`),
      params({ weddingId }),
    );
    expect(ok.status).toBe(200);
    const bad = await getTeamHandler(
      request('GET', '/api/weddings/nope/members'),
      params({ weddingId: 'nope' }),
    );
    expect(bad.status).toBe(404);
    expect(service.getTeam).toHaveBeenCalledTimes(1);
  });
});

describe('invite resend and cancel', () => {
  it('pass both ids to the service', async () => {
    vi.mocked(service.renewInvite).mockResolvedValueOnce({} as never);
    const renewed = await renewInviteHandler(
      request('POST', `${invitesPath}/${inviteId}/resend`),
      params({ weddingId, inviteId }),
    );
    expect(renewed.status).toBe(200);
    expect(vi.mocked(service.renewInvite).mock.calls[0]![2].toHexString()).toBe(inviteId);

    const cancelled = await cancelInviteHandler(
      request('DELETE', `${invitesPath}/${inviteId}`),
      params({ weddingId, inviteId }),
    );
    expect(cancelled.status).toBe(204);
    expect(vi.mocked(service.cancelInvite).mock.calls[0]![2].toHexString()).toBe(inviteId);
  });

  it('return 404 for a malformed invite id without calling the service', async () => {
    const renewed = await renewInviteHandler(
      request('POST', `${invitesPath}/nope/resend`),
      params({ weddingId, inviteId: 'nope' }),
    );
    const cancelled = await cancelInviteHandler(
      request('DELETE', `${invitesPath}/nope`),
      params({ weddingId, inviteId: 'nope' }),
    );
    expect([renewed.status, cancelled.status]).toEqual([404, 404]);
    expect(service.renewInvite).not.toHaveBeenCalled();
    expect(service.cancelInvite).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/weddings/{weddingId}/members/{memberId}', () => {
  const patch = (body: unknown, id = memberId) =>
    changeMemberHandler(
      request('PATCH', `/api/weddings/${weddingId}/members/${id}`, body),
      params({ weddingId, memberId: id }),
    );

  it('passes the change to the service', async () => {
    vi.mocked(service.changeMember).mockResolvedValueOnce({ id: memberId } as never);
    const res = await patch({ role: 'manager', sideScope: 'groom' });
    expect(res.status).toBe(200);
    expect(vi.mocked(service.changeMember).mock.calls[0]![3]).toEqual({
      role: 'manager',
      sideScope: 'groom',
    });
  });

  it('refuses an empty change, an unknown role and a malformed id', async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ role: 'owner' })).status).toBe(400);
    expect((await patch({ role: 'manager' }, 'nope')).status).toBe(404);
    expect(service.changeMember).not.toHaveBeenCalled();
  });
});

describe('invite links', () => {
  it('preview and accept pass the token on', async () => {
    vi.mocked(service.previewInvite).mockResolvedValueOnce({ weddingName: 'N & I' } as never);
    const preview = await previewInviteHandler(
      request('GET', `/api/member-invites/${token}`),
      params({ token }),
    );
    expect(preview.status).toBe(200);
    expect(service.previewInvite).toHaveBeenCalledWith(token);

    vi.mocked(service.acceptInvite).mockResolvedValueOnce({ weddingId });
    const accepted = await acceptInviteHandler(
      request('POST', `/api/member-invites/${token}/accept`),
      params({ token }),
    );
    expect(accepted.status).toBe(200);
    expect(service.acceptInvite).toHaveBeenCalledWith('raw-token', token);
  });

  it('turn away malformed tokens without calling the service', async () => {
    for (const bad of ['short', `${'a'.repeat(42)}!`, 'a'.repeat(44)]) {
      const preview = await previewInviteHandler(
        request('GET', `/api/member-invites/${bad}`),
        params({ token: bad }),
      );
      expect(preview.status).toBe(404);
    }
    expect(service.previewInvite).not.toHaveBeenCalled();
  });

  it('refuses an accept from another site', async () => {
    const res = await acceptInviteHandler(
      request('POST', `/api/member-invites/${token}/accept`, undefined, 'https://evil.example'),
      params({ token }),
    );
    expect(res.status).toBe(403);
    expect(service.acceptInvite).not.toHaveBeenCalled();
  });
});
