import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import { GET as preview } from '@/app/api/member-invites/[token]/route';
import {
  DELETE as deleteMember,
  PATCH as patchMember,
} from '@/app/api/weddings/[weddingId]/members/[memberId]/route';
import { DELETE as cancelInvite } from '@/app/api/weddings/[weddingId]/members/invites/[inviteId]/route';
import { POST as renewInvite } from '@/app/api/weddings/[weddingId]/members/invites/[inviteId]/resend/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { GET as getTeam } from '@/app/api/weddings/[weddingId]/members/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { clearTestOutbox, failTestEmails, testOutbox } from '@/lib/email';
import { collectionSpecs } from '@/modules/collections';
import { todayIn } from '@/shared/dates';

// Team invitations end to end against the Atlas test database. Email goes to the in-memory
// test outbox, never to Resend.

const YEAR = Number(todayIn('Asia/Kolkata').slice(0, 4)) + 2;

beforeAll(async () => {
  await applyCollectionSpecs(getDb(), collectionSpecs);
});
beforeEach(() => clearTestOutbox());

let counter = 0;
function request(method: string, path: string, cookie?: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-forwarded-for': `203.0.113.${++counter % 250}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function newUser(name: string, email = `${name.toLowerCase()}.${++counter}@example.com`) {
  const res = await signup(
    request('POST', '/api/auth/signup', undefined, { name, email, password: 'correct-horse-42' }),
  );
  expect(res.status).toBe(201);
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, email };
}

async function newWedding(cookie: string, sidesEnabled = true): Promise<string> {
  const res = await createWedding(
    request('POST', '/api/weddings', cookie, {
      brideName: 'Nafiya',
      groomName: 'Irfan',
      weddingDate: `${YEAR}-04-14`,
      city: 'Kochi',
      sidesEnabled,
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).data.id;
}

const invite = (weddingId: string, cookie: string, body: unknown) =>
  createInvite(
    request('POST', `/api/weddings/${weddingId}/members/invites`, cookie, body),
    params({ weddingId }),
  );
const team = (weddingId: string, cookie: string) =>
  getTeam(request('GET', `/api/weddings/${weddingId}/members`, cookie), params({ weddingId }));
const tokenOf = (link: string) => link.split('/join/')[1]!;
const peek = (token: string) =>
  preview(request('GET', `/api/member-invites/${token}`), params({ token }));
const join = (token: string, cookie: string) =>
  accept(request('POST', `/api/member-invites/${token}/accept`, cookie), params({ token }));

const renew = (weddingId: string, inviteId: string, cookie: string) =>
  renewInvite(
    request('POST', `/api/weddings/${weddingId}/members/invites/${inviteId}/resend`, cookie),
    params({ weddingId, inviteId }),
  );
const cancel = (weddingId: string, inviteId: string, cookie: string) =>
  cancelInvite(
    request('DELETE', `/api/weddings/${weddingId}/members/invites/${inviteId}`, cookie),
    params({ weddingId, inviteId }),
  );

async function setUp() {
  const admin = await newUser('Nafiya');
  const weddingId = await newWedding(admin.cookie);
  return { admin, weddingId };
}

describe('member invitations (Atlas test database)', () => {
  it('invites, emails the link, and lets the invited person join', async () => {
    const { admin, weddingId } = await setUp();
    const email = `ahmed.${++counter}@example.com`;

    const res = await invite(weddingId, admin.cookie, {
      email: email.toUpperCase(),
      role: 'manager',
      sideScope: 'groom',
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({
      invite: { email, role: 'manager', sideScope: 'groom', expired: false },
      emailSent: true,
    });
    const token = tokenOf(data.inviteLink);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // The email went to the invitee, from the inviter's name, with the link in it.
    expect(testOutbox()).toHaveLength(1);
    const [sent] = testOutbox();
    expect(sent).toMatchObject({ to: email });
    expect(sent!.from).toMatch(/^"Nafiya via Make My Marriage" <invites@example\.com>$/);
    expect(sent!.subject).toBe('Nafiya & Irfan invited you to help plan their wedding');
    expect(sent!.html).toContain(data.inviteLink);
    expect(sent!.text).toContain(data.inviteLink);

    // Neither the raw link nor the body is stored anywhere.
    const stored = await getDb().collection('memberInvites').findOne({ email });
    expect(JSON.stringify(stored)).not.toContain(token);
    const log = await getDb().collection('emailLogs').findOne({ to: email });
    expect(log).toMatchObject({ template: 'member_invite', status: 'sent' });
    expect(JSON.stringify(log)).not.toContain(token);

    const shown = await peek(token);
    expect(shown.status).toBe(200);
    expect((await shown.json()).data).toMatchObject({
      weddingName: 'Nafiya & Irfan',
      invitedEmail: email,
      invitedByName: 'Nafiya',
      role: 'manager',
      sideScope: 'groom',
    });

    const ahmed = await newUser('Ahmed', email);
    const joined = await join(token, ahmed.cookie);
    expect(joined.status).toBe(200);
    expect((await joined.json()).data).toEqual({ weddingId });

    const list = (await (await team(weddingId, admin.cookie)).json()).data;
    expect(
      list.members.map((m: { user: { email: string }; role: string }) => [m.user.email, m.role]),
    ).toEqual([
      [admin.email, 'admin'],
      [email, 'manager'],
    ]);
    expect(list.pendingInvites).toEqual([]);

    // The link works once.
    const again = await peek(token);
    expect(again.status).toBe(404);
    expect((await again.json()).error).toMatchObject({
      code: 'INVITE_INVALID',
      details: { reason: 'used' },
    });
  });

  it('keeps the invite and the link when the email fails', async () => {
    const { admin, weddingId } = await setUp();
    failTestEmails();
    const res = await invite(weddingId, admin.cookie, {
      email: `bounce.${++counter}@example.com`,
      role: 'manager',
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.emailSent).toBe(false);
    expect((await peek(tokenOf(data.inviteLink))).status).toBe(200);
    expect(
      await getDb().collection('emailLogs').findOne({ to: data.invite.email, status: 'failed' }),
    ).not.toBeNull();
  });

  it('explains links that no longer work, and renews them', async () => {
    const { admin, weddingId } = await setUp();
    const email = `late.${++counter}@example.com`;
    const { data } = await (
      await invite(weddingId, admin.cookie, { email, role: 'manager' })
    ).json();
    const oldToken = tokenOf(data.inviteLink);

    await getDb()
      .collection('memberInvites')
      .updateOne({ email }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await (await peek(oldToken)).json()).error.details).toEqual({ reason: 'expired' });
    const listed = (await (await team(weddingId, admin.cookie)).json()).data.pendingInvites;
    expect(listed[0]).toMatchObject({ email, expired: true });

    const renewed = await renewInvite(
      request(
        'POST',
        `/api/weddings/${weddingId}/members/invites/${data.invite.id}/resend`,
        admin.cookie,
      ),
      params({ weddingId, inviteId: data.invite.id }),
    );
    expect(renewed.status).toBe(200);
    const fresh = (await renewed.json()).data;
    expect(fresh).toMatchObject({ invite: { expired: false }, emailSent: true });
    expect(testOutbox()).toHaveLength(2);
    expect((await peek(tokenOf(fresh.inviteLink))).status).toBe(200);

    // The replaced link now looks like a made-up one.
    const old = await (await peek(oldToken)).json();
    expect(old.error.code).toBe('INVITE_INVALID');
    expect(old.error.details).toBeUndefined();

    const cancelled = await cancelInvite(
      request(
        'DELETE',
        `/api/weddings/${weddingId}/members/invites/${data.invite.id}`,
        admin.cookie,
      ),
      params({ weddingId, inviteId: data.invite.id }),
    );
    expect(cancelled.status).toBe(204);
    expect((await (await peek(tokenOf(fresh.inviteLink))).json()).error.details).toEqual({
      reason: 'cancelled',
    });
  });

  it('refuses the wrong account, a duplicate invite and someone already on the team', async () => {
    const { admin, weddingId } = await setUp();
    const email = `right.${++counter}@example.com`;
    const { data } = await (
      await invite(weddingId, admin.cookie, { email, role: 'manager' })
    ).json();
    const token = tokenOf(data.inviteLink);

    const pending = await invite(weddingId, admin.cookie, { email, role: 'manager' });
    expect((await pending.json()).error.code).toBe('INVITE_PENDING');

    const someoneElse = await newUser('Wrong');
    const mismatch = await join(token, someoneElse.cookie);
    expect(mismatch.status).toBe(403);
    expect((await mismatch.json()).error).toMatchObject({
      code: 'INVITE_EMAIL_MISMATCH',
      details: { invitedEmail: email },
    });

    const already = await invite(weddingId, admin.cookie, { email: admin.email, role: 'manager' });
    expect(already.status).toBe(409);
    expect((await already.json()).error.code).toBe('ALREADY_MEMBER');

    expect((await join(token, 'mmm_session=nope')).status).toBe(401);
    expect((await peek('x'.repeat(43))).status).toBe(404);
  });

  it('applies the admin rules: 2 at most, never 0, one admin wedding per person', async () => {
    const { admin, weddingId } = await setUp();
    const partnerEmail = `partner.${++counter}@example.com`;
    const first = await invite(weddingId, admin.cookie, { email: partnerEmail, role: 'admin' });
    expect(first.status).toBe(201);
    const second = await invite(weddingId, admin.cookie, {
      email: `third.${++counter}@example.com`,
      role: 'admin',
    });
    expect((await second.json()).error.code).toBe('ADMIN_LIMIT_REACHED');

    // The partner already runs their own wedding: they can't also be an admin here.
    const partner = await newUser('Partner', partnerEmail);
    await newWedding(partner.cookie);
    const firstData = (await first.json()).data;
    const token = tokenOf(firstData.inviteLink);
    const blocked = await join(token, partner.cookie);
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error.code).toBe('ALREADY_HAS_WEDDING');

    // A manager joins and is promoted; demoting the last admin is refused.
    const managerEmail = `uncle.${++counter}@example.com`;
    const m = await (
      await invite(weddingId, admin.cookie, { email: managerEmail, role: 'manager' })
    ).json();
    const uncle = await newUser('Uncle', managerEmail);
    await join(tokenOf(m.data.inviteLink), uncle.cookie);
    const list = (await (await team(weddingId, admin.cookie)).json()).data;
    const memberId = (role: string) =>
      list.members.find((x: { role: string; user: { email: string } }) =>
        role === 'admin' ? x.user.email === admin.email : x.user.email === managerEmail,
      ).id;

    const change = (id: string, body: unknown) =>
      patchMember(
        request('PATCH', `/api/weddings/${weddingId}/members/${id}`, admin.cookie, body),
        params({ weddingId, memberId: id }),
      );
    const lastAdmin = await change(memberId('admin'), { role: 'manager' });
    expect((await lastAdmin.json()).error.code).toBe('LAST_ADMIN');

    // The partner's admin invite is still pending and holds the second admin place.
    const held = await change(memberId('manager'), { role: 'admin' });
    expect((await held.json()).error.code).toBe('ADMIN_LIMIT_REACHED');
    expect((await cancel(weddingId, firstData.invite.id, admin.cookie)).status).toBe(204);

    const promoted = await change(memberId('manager'), { role: 'admin', sideScope: 'groom' });
    expect(promoted.status).toBe(200);
    expect((await promoted.json()).data).toMatchObject({ role: 'admin', sideScope: 'both' });

    // Another wedding's member id is "not found" here.
    const other = await setUp();
    const otherList = (await (await team(other.weddingId, other.admin.cookie)).json()).data;
    expect((await change(otherList.members[0].id, { role: 'manager' })).status).toBe(404);
  });

  it('checks the 2-admin limit again before renewing an expired admin invite', async () => {
    const { admin, weddingId } = await setUp();
    const old = await (
      await invite(weddingId, admin.cookie, {
        email: `old.${++counter}@example.com`,
        role: 'admin',
      })
    ).json();
    // Once expired, it stops holding the second admin place...
    await getDb()
      .collection('memberInvites')
      .updateOne(
        { _id: ObjectId.createFromHexString(old.data.invite.id) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
    const replacement = await invite(weddingId, admin.cookie, {
      email: `new.${++counter}@example.com`,
      role: 'admin',
    });
    expect(replacement.status).toBe(201);

    // ...so it can't come back while another admin invite holds that place.
    const renewed = await renew(weddingId, old.data.invite.id, admin.cookie);
    expect(renewed.status).toBe(409);
    expect((await renewed.json()).error.code).toBe('ADMIN_LIMIT_REACHED');

    // Renewing the live admin invite itself is fine: it doesn't count against itself.
    const replacementId = (await replacement.json()).data.invite.id;
    expect((await renew(weddingId, replacementId, admin.cookie)).status).toBe(200);
  });

  it("can't reach another wedding's invites or members through your own wedding", async () => {
    const a = await setUp();
    const b = await setUp();
    const aInvite = await (
      await invite(a.weddingId, a.admin.cookie, {
        email: `cousin.${++counter}@example.com`,
        role: 'manager',
      })
    ).json();
    const aInviteId = aInvite.data.invite.id;
    const aAdminMemberId = (await (await team(a.weddingId, a.admin.cookie)).json()).data.members[0]
      .id;

    // Wedding B's admin, using B's own wedding id with A's invite and member ids.
    expect((await renew(b.weddingId, aInviteId, b.admin.cookie)).status).toBe(404);
    expect((await cancel(b.weddingId, aInviteId, b.admin.cookie)).status).toBe(404);
    const patch = await patchMember(
      request('PATCH', `/api/weddings/${b.weddingId}/members/${aAdminMemberId}`, b.admin.cookie, {
        role: 'manager',
      }),
      params({ weddingId: b.weddingId, memberId: aAdminMemberId }),
    );
    expect(patch.status).toBe(404);

    // Wedding A is untouched: the invite still works with its original link, and A's admin
    // is still an admin.
    const aTeam = (await (await team(a.weddingId, a.admin.cookie)).json()).data;
    expect(aTeam.pendingInvites).toHaveLength(1);
    expect(aTeam.members[0].role).toBe('admin');
    expect((await peek(tokenOf(aInvite.data.inviteLink))).status).toBe(200);
  });

  it('keeps Managers and strangers out of team management', async () => {
    const { admin, weddingId } = await setUp();
    const email = `helper.${++counter}@example.com`;
    const { data } = await (
      await invite(weddingId, admin.cookie, { email, role: 'manager' })
    ).json();
    const helper = await newUser('Helper', email);
    await join(tokenOf(data.inviteLink), helper.cookie);

    const asManager = await invite(weddingId, helper.cookie, {
      email: `x.${++counter}@example.com`,
      role: 'manager',
    });
    expect(asManager.status).toBe(403);
    const managerView = (await (await team(weddingId, helper.cookie)).json()).data;
    expect(managerView.members).toHaveLength(2);
    expect(managerView.pendingInvites).toBeNull();

    const stranger = await newUser('Stranger');
    expect((await team(weddingId, stranger.cookie)).status).toBe(404);
    expect(
      (await invite(weddingId, stranger.cookie, { email: 'a@example.com', role: 'manager' }))
        .status,
    ).toBe(404);

    await getDb()
      .collection('weddings')
      .updateOne(
        { _id: ObjectId.createFromHexString(weddingId) },
        { $set: { status: 'archived' } },
      );
    const archived = await invite(weddingId, admin.cookie, {
      email: `y.${++counter}@example.com`,
      role: 'manager',
    });
    expect((await archived.json()).error.code).toBe('WEDDING_ARCHIVED');
  });

  it('lets an admin remove a member, who loses access and can be invited again', async () => {
    const { admin, weddingId } = await setUp();
    const email = `cousin.${++counter}@example.com`;
    const sent = await (await invite(weddingId, admin.cookie, { email, role: 'manager' })).json();
    const cousin = await newUser('Cousin', email);
    await join(tokenOf(sent.data.inviteLink), cousin.cookie);

    const list = (await (await team(weddingId, admin.cookie)).json()).data;
    const cousinId = list.members.find(
      (m: { user: { email: string } }) => m.user.email === email,
    ).id;
    const adminId = list.members.find(
      (m: { user: { email: string } }) => m.user.email === admin.email,
    ).id;
    const remove = (id: string, cookie: string) =>
      deleteMember(
        request('DELETE', `/api/weddings/${weddingId}/members/${id}`, cookie),
        params({ weddingId, memberId: id }),
      );

    // A Manager can't remove anyone; the last admin can't be removed.
    expect((await remove(adminId, cousin.cookie)).status).toBe(403);
    const last = await remove(adminId, admin.cookie);
    expect(last.status).toBe(409);
    expect((await last.json()).error.code).toBe('LAST_ADMIN');

    expect((await remove(cousinId, admin.cookie)).status).toBe(204);
    // Access ends on their next request, and the member is gone from the team.
    expect((await team(weddingId, cousin.cookie)).status).toBe(404);
    const after = (await (await team(weddingId, admin.cookie)).json()).data;
    expect(after.members.map((m: { user: { email: string } }) => m.user.email)).toEqual([
      admin.email,
    ]);
    expect((await remove(cousinId, admin.cookie)).status).toBe(404);

    // They can be invited again.
    const again = await invite(weddingId, admin.cookie, { email, role: 'manager' });
    expect(again.status).toBe(201);
    expect((await join(tokenOf((await again.json()).data.inviteLink), cousin.cookie)).status).toBe(
      200,
    );

    // Another wedding's member is "not found" here; archived weddings can't change.
    const other = await setUp();
    const otherAdminId = (await (await team(other.weddingId, other.admin.cookie)).json()).data
      .members[0].id;
    expect((await remove(otherAdminId, admin.cookie)).status).toBe(404);
    await getDb()
      .collection('weddings')
      .updateOne(
        { _id: ObjectId.createFromHexString(weddingId) },
        { $set: { status: 'archived' } },
      );
    expect((await (await remove(cousinId, admin.cookie)).json()).error.code).toBe(
      'WEDDING_ARCHIVED',
    );
  });
});
