import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import { GET as calendar } from '@/app/api/public/invitations/[token]/events/[eventId]/calendar.ics/route';
import { POST as opened } from '@/app/api/public/invitations/[token]/opened/route';
import { GET as publicInvitation } from '@/app/api/public/invitations/[token]/route';
import { PUT as reply } from '@/app/api/public/invitations/[token]/rsvp/route';
import { POST as stopReminders } from '@/app/api/public/invitations/[token]/stop-reminders/route';
import { POST as createEvent } from '@/app/api/weddings/[weddingId]/events/route';
import { POST as presign } from '@/app/api/weddings/[weddingId]/files/presign/route';
import { POST as markSent } from '@/app/api/weddings/[weddingId]/households/[householdId]/mark-sent/route';
import { POST as regenerate } from '@/app/api/weddings/[weddingId]/households/[householdId]/regenerate-link/route';
import { GET as getHousehold } from '@/app/api/weddings/[weddingId]/households/[householdId]/route';
import {
  DELETE as clearRsvp,
  PUT as recordRsvp,
} from '@/app/api/weddings/[weddingId]/households/[householdId]/rsvps/[eventId]/route';
import { POST as createHousehold } from '@/app/api/weddings/[weddingId]/households/route';
import {
  GET as getInvitation,
  PUT as putInvitation,
} from '@/app/api/weddings/[weddingId]/invitation/route';
import { POST as testInvitation } from '@/app/api/weddings/[weddingId]/invitation/test/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { GET as rsvpExport } from '@/app/api/weddings/[weddingId]/rsvp/export/route';
import { GET as rsvpSummary } from '@/app/api/weddings/[weddingId]/rsvp/summary/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { clearTestOutbox, testOutbox } from '@/lib/email';
import { testObjects } from '@/lib/r2';
import { collectionSpecs } from '@/modules/collections';
import { parseCsv } from '@/shared/csv';
import { addDays, todayIn } from '@/shared/dates';

// Invitations and RSVP end to end against the Atlas test database (api-spec §9.10–9.13, §10,
// §11, §15): the card and settings, the guest page and replies, host tools and totals.

const YEAR = Number(todayIn('Asia/Kolkata').slice(0, 4)) + 2;
const BROWSER =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

beforeAll(async () => {
  await applyCollectionSpecs(getDb(), collectionSpecs);
});
beforeEach(() => clearTestOutbox());

let counter = 0;
function request(
  method: string,
  path: string,
  cookie?: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-forwarded-for': `198.51.100.${++counter % 250}`,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function newUser(name: string) {
  const email = `${name.toLowerCase()}.inv.${++counter}.${Date.now()}@example.com`;
  const res = await signup(
    request('POST', '/api/auth/signup', undefined, { name, email, password: 'correct-horse-42' }),
  );
  expect(res.status).toBe(201);
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, email };
}

async function newWedding(cookie: string, sidesEnabled = false): Promise<string> {
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

async function newEvent(weddingId: string, cookie: string, name: string, date: string) {
  const res = await createEvent(
    request('POST', `/api/weddings/${weddingId}/events`, cookie, {
      name,
      date,
      startTime: '16:00',
      venueName: 'Family home',
      dressCode: 'Green, yellow',
    }),
    params({ weddingId }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).data.id as string;
}

async function newFamily(weddingId: string, cookie: string, body: Record<string, unknown>) {
  const res = await createHousehold(
    request('POST', `/api/weddings/${weddingId}/households`, cookie, body),
    params({ weddingId }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).data as { id: string; inviteLink: string };
}

const tokenOf = (inviteLink: string) => inviteLink.split('/invited/')[1]!;

/** A stored JPEG for the fake storage: the upload check reads its first bytes (FF D8 FF). */
const jpeg = (sizeBytes: number) => ({
  sizeBytes,
  contentType: 'image/jpeg',
  firstBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
});

const saveSettings = (weddingId: string, cookie: string, body: unknown) =>
  putInvitation(
    request('PUT', `/api/weddings/${weddingId}/invitation`, cookie, body),
    params({ weddingId }),
  );

const settings = {
  mediaKey: null,
  message: 'With the blessings of our families, we invite you.',
  rsvpDeadline: null,
  autoRemindersEnabled: true,
};

const view = (token: string) =>
  publicInvitation(request('GET', `/api/public/invitations/${token}`), params({ token }));
const answer = (token: string, responses: unknown[]) =>
  reply(
    request('PUT', `/api/public/invitations/${token}/rsvp`, undefined, { responses }),
    params({ token }),
  );
const family = async (weddingId: string, householdId: string, cookie: string) =>
  (
    await (
      await getHousehold(
        request('GET', `/api/weddings/${weddingId}/households/${householdId}`, cookie),
        params({ weddingId, householdId }),
      )
    ).json()
  ).data;

async function setup() {
  const admin = await newUser('Nafiya');
  const weddingId = await newWedding(admin.cookie);
  const mehendi = await newEvent(weddingId, admin.cookie, 'Mehendi', `${YEAR}-04-12`);
  const sangeet = await newEvent(weddingId, admin.cookie, 'Sangeet', `${YEAR}-04-13`);
  const reception = await newEvent(weddingId, admin.cookie, 'Reception', `${YEAR}-04-15`);
  const sharma = await newFamily(weddingId, admin.cookie, {
    displayName: 'Sharma family',
    members: [{ name: 'Rajesh' }, { name: 'Sunita' }, { name: 'Aarav' }],
    email: 'sharma@example.com',
    invitedEvents: [{ eventId: mehendi }, { eventId: sangeet, headcount: 2 }],
  });
  return {
    admin,
    weddingId,
    mehendi,
    sangeet,
    reception,
    sharma,
    token: tokenOf(sharma.inviteLink),
  };
}

describe('invitation settings (Atlas test database)', () => {
  it('saves the message and deadline, checks the deadline against the last event', async () => {
    const { admin, weddingId } = await setup();
    const initial = await (
      await getInvitation(
        request('GET', `/api/weddings/${weddingId}/invitation`, admin.cookie),
        params({ weddingId }),
      )
    ).json();
    expect(initial.data).toMatchObject({
      media: null,
      rsvpDeadline: null,
      autoRemindersEnabled: true,
      latestDeadline: `${YEAR}-04-15`,
    });
    expect(initial.data.message.length).toBeGreaterThan(20);

    const late = await saveSettings(weddingId, admin.cookie, {
      ...settings,
      rsvpDeadline: `${YEAR}-04-16`,
    });
    expect(late.status).toBe(400);
    expect((await late.json()).error.details[0].path).toBe('rsvpDeadline');

    const saved = await saveSettings(weddingId, admin.cookie, {
      ...settings,
      rsvpDeadline: `${YEAR}-03-31`,
      autoRemindersEnabled: false,
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toMatchObject({
      message: settings.message,
      rsvpDeadline: `${YEAR}-03-31`,
      autoRemindersEnabled: false,
    });
    // A new deadline can't be in the past: it would close replies for everyone at once.
    const past = await saveSettings(weddingId, admin.cookie, {
      ...settings,
      rsvpDeadline: addDays(todayIn('Asia/Kolkata'), -1),
    });
    expect(past.status).toBe(400);
    expect((await past.json()).error.details).toEqual([
      { path: 'rsvpDeadline', message: 'Pick today or a later date' },
    ]);
  });

  it('accepts only an uploaded image of this wedding as the card', async () => {
    const { admin, weddingId } = await setup();
    const other = await newWedding((await newUser('Riya')).cookie);
    const presignFor = (body: unknown) =>
      presign(
        request('POST', `/api/weddings/${weddingId}/files/presign`, admin.cookie, body),
        params({ weddingId }),
      );

    // Video and PDF wait for later; images are capped at 10 MB.
    const video = await presignFor({
      purpose: 'invitation',
      fileName: 'card.mp4',
      contentType: 'video/mp4',
      sizeBytes: 1000,
    });
    expect((await video.json()).error.code).toBe('UNSUPPORTED_FILE_TYPE');
    const big = await presignFor({
      purpose: 'invitation',
      fileName: 'card.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 11 * 1024 * 1024,
    });
    expect(big.status).toBe(413);

    const ok = await presignFor({
      purpose: 'invitation',
      fileName: 'card.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 845_123,
    });
    expect(ok.status).toBe(200);
    const upload = (await ok.json()).data;
    expect(upload.key).toMatch(new RegExp(`^weddings/${weddingId}/invitation/.+\\.jpg$`));
    expect(upload.headers).toEqual({ 'Content-Type': 'image/jpeg', 'Content-Length': '845123' });

    // Not uploaded yet.
    const missing = await saveSettings(weddingId, admin.cookie, {
      ...settings,
      mediaKey: upload.key,
    });
    expect((await missing.json()).error.code).toBe('FILE_NOT_UPLOADED');

    // Another wedding's file can never be claimed.
    const foreignKey = `weddings/${other}/invitation/abc.jpg`;
    testObjects().set(foreignKey, jpeg(100));
    const foreign = await saveSettings(weddingId, admin.cookie, {
      ...settings,
      mediaKey: foreignKey,
    });
    expect((await foreign.json()).error.code).toBe('FILE_NOT_UPLOADED');

    // A renamed file (text called card.jpg) is refused by its content, and deleted.
    testObjects().set(upload.key, {
      ...jpeg(845_123),
      firstBytes: new TextEncoder().encode('not an image'),
    });
    const renamed = await saveSettings(weddingId, admin.cookie, {
      ...settings,
      mediaKey: upload.key,
    });
    expect((await renamed.json()).error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(testObjects().has(upload.key)).toBe(false);

    testObjects().set(upload.key, jpeg(845_123));
    const saved = await saveSettings(weddingId, admin.cookie, {
      ...settings,
      mediaKey: upload.key,
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data.media).toMatchObject({
      key: upload.key,
      type: 'image',
      sizeBytes: 845_123,
    });

    // Removing the card deletes the file.
    const removed = await saveSettings(weddingId, admin.cookie, settings);
    expect((await removed.json()).data.media).toBeNull();
    expect(testObjects().has(upload.key)).toBe(false);
  });

  it('keeps the card when only the text settings change, even after it was replaced', async () => {
    const { admin, weddingId } = await setup();
    const keyA = `weddings/${weddingId}/invitation/card-a.jpg`;
    const keyB = `weddings/${weddingId}/invitation/card-b.jpg`;
    testObjects().set(keyA, jpeg(1000));
    testObjects().set(keyB, jpeg(2000));
    expect((await saveSettings(weddingId, admin.cookie, { mediaKey: keyA })).status).toBe(200);
    // Replaced (say in another tab): card A's file is deleted.
    expect((await saveSettings(weddingId, admin.cookie, { mediaKey: keyB })).status).toBe(200);
    expect(testObjects().has(keyA)).toBe(false);

    // The settings form sends only its own fields, so a page still showing card A saves fine.
    const res = await saveSettings(weddingId, admin.cookie, { rsvpDeadline: `${YEAR}-03-31` });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.media).toMatchObject({ key: keyB, sizeBytes: 2000 });
    expect(data.rsvpDeadline).toBe(`${YEAR}-03-31`);
    expect(data.message.length).toBeGreaterThan(20);

    // Changing only the card keeps the text settings.
    const card = await saveSettings(weddingId, admin.cookie, { mediaKey: null });
    expect((await card.json()).data).toMatchObject({ media: null, rsvpDeadline: `${YEAR}-03-31` });

    const empty = await saveSettings(weddingId, admin.cookie, {});
    expect(empty.status).toBe(400);
  });

  it('sends a test invitation to the caller', async () => {
    const { admin, weddingId } = await setup();
    const res = await testInvitation(
      request('POST', `/api/weddings/${weddingId}/invitation/test`, admin.cookie),
      params({ weddingId }),
    );
    expect(res.status).toBe(200);
    expect(testOutbox()).toHaveLength(1);
    const [sent] = testOutbox();
    expect(sent!.to).toBe(admin.email);
    expect(sent!.subject).toContain('[Test]');
    expect(sent!.html).toContain(`/app/${weddingId}/invitations/preview`);
  });
});

describe('guest invitation page and replies (Atlas test database)', () => {
  it('shows only the family and its invited events', async () => {
    const { token, mehendi, sangeet } = await setup();
    const res = await view(token);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { data } = await res.json();
    expect(data.household.displayName).toBe('Sharma family');
    expect(data.events.map((e: { id: string }) => e.id)).toEqual([mehendi, sangeet]);
    expect(data.events[1]).toMatchObject({ name: 'Sangeet', maxHeadcount: 2, rsvp: null });
    expect(data.rsvpOpen).toBe(true);
    // Nothing that identifies other families or the team.
    expect(JSON.stringify(data)).not.toContain('email');

    const unknown = await view('A'.repeat(22));
    expect((await unknown.json()).error.code).toBe('LINK_INVALID');
    // A mistyped or cut-short link gets the same answer, not a generic 404.
    const malformed = await view('doesnotexist');
    expect(malformed.status).toBe(404);
    expect((await malformed.json()).error.code).toBe('LINK_INVALID');
  });

  it('saves replies within the invited numbers and emails a confirmation', async () => {
    const { admin, weddingId, sharma, token, mehendi, sangeet, reception } = await setup();

    const tooMany = await answer(token, [
      { eventId: sangeet, status: 'attending', attendingCount: 3 },
    ]);
    expect((await tooMany.json()).error.code).toBe('HEADCOUNT_EXCEEDED');
    const notInvited = await answer(token, [
      { eventId: reception, status: 'attending', attendingCount: 1 },
    ]);
    expect((await notInvited.json()).error.code).toBe('NOT_INVITED_TO_EVENT');
    const noCount = await answer(token, [{ eventId: mehendi, status: 'attending' }]);
    expect(noCount.status).toBe(400);
    expect(testOutbox()).toHaveLength(0);

    const saved = await answer(token, [
      { eventId: mehendi, status: 'attending', attendingCount: 3, note: 'Vegetarian' },
    ]);
    expect(saved.status).toBe(200);
    expect((await saved.json()).data.events[0].rsvp).toEqual({
      status: 'attending',
      attendingCount: 3,
      note: 'Vegetarian',
    });
    expect((await family(weddingId, sharma.id, admin.cookie)).responseStatus).toBe('partial');
    expect(testOutbox()).toHaveLength(1);
    expect(testOutbox()[0]!.to).toBe('sharma@example.com');

    // Declining forces 0 people; every event answered → complete.
    await answer(token, [{ eventId: sangeet, status: 'declined', attendingCount: 2 }]);
    const after = await family(weddingId, sharma.id, admin.cookie);
    expect(after.responseStatus).toBe('complete');
    expect(after.rsvps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventId: sangeet, status: 'declined', attendingCount: 0 }),
        expect.objectContaining({ eventId: mehendi, recordedBy: 'guest' }),
      ]),
    );
  });

  it('closes replies after the deadline, but the couple can still record one', async () => {
    const { admin, weddingId, sharma, token, mehendi } = await setup();
    // A deadline that has passed (the API won't set a past one, so it's set directly).
    await getDb()
      .collection('weddings')
      .updateOne(
        { _id: new ObjectId(weddingId) },
        { $set: { 'invitation.rsvpDeadline': addDays(todayIn('Asia/Kolkata'), -1) } },
      );
    // A passed deadline that's simply kept doesn't block saving the message.
    const kept = await saveSettings(weddingId, admin.cookie, {
      message: 'Updated after the deadline',
      rsvpDeadline: addDays(todayIn('Asia/Kolkata'), -1),
    });
    expect(kept.status).toBe(200);
    const page = (await (await view(token)).json()).data;
    expect(page).toMatchObject({ rsvpOpen: false, closedReason: 'deadline' });
    const late = await answer(token, [{ eventId: mehendi, status: 'declined' }]);
    expect(late.status).toBe(409);
    expect((await late.json()).error.code).toBe('RSVP_CLOSED');

    const recorded = await recordRsvp(
      request(
        'PUT',
        `/api/weddings/${weddingId}/households/${sharma.id}/rsvps/${mehendi}`,
        admin.cookie,
        { status: 'attending', attendingCount: 2, note: 'Confirmed by phone' },
      ),
      params({ weddingId, householdId: sharma.id, eventId: mehendi }),
    );
    expect(recorded.status).toBe(200);
    expect((await recorded.json()).data.rsvps[0]).toMatchObject({
      status: 'attending',
      attendingCount: 2,
      note: 'Confirmed by phone',
      recordedBy: 'host',
    });

    const cleared = await clearRsvp(
      request(
        'DELETE',
        `/api/weddings/${weddingId}/households/${sharma.id}/rsvps/${mehendi}`,
        admin.cookie,
      ),
      params({ weddingId, householdId: sharma.id, eventId: mehendi }),
    );
    expect(cleared.status).toBe(204);
    expect((await family(weddingId, sharma.id, admin.cookie)).responseStatus).toBe('none');
  });

  it('counts an open only from a real browser, never a link preview', async () => {
    const { admin, weddingId, sharma, token } = await setup();
    const open = (userAgent: string) =>
      opened(
        request('POST', `/api/public/invitations/${token}/opened`, undefined, undefined, {
          'user-agent': userAgent,
        }),
        params({ token }),
      );
    expect((await open('WhatsApp/2.23.20.0 A')).status).toBe(204);
    expect((await family(weddingId, sharma.id, admin.cookie)).openedAt).toBeNull();
    expect((await open(BROWSER)).status).toBe(204);
    const first = (await family(weddingId, sharma.id, admin.cookie)).openedAt;
    expect(first).not.toBeNull();
    await open(BROWSER);
    expect((await family(weddingId, sharma.id, admin.cookie)).openedAt).toBe(first);

    const stop = await stopReminders(
      request('POST', `/api/public/invitations/${token}/stop-reminders`),
      params({ token }),
    );
    expect(stop.status).toBe(204);
  });

  it('gives a calendar file for an invited event only', async () => {
    const { token, mehendi, reception } = await setup();
    const res = await calendar(
      request('GET', `/api/public/invitations/${token}/events/${mehendi}/calendar.ics`),
      params({ token, eventId: mehendi }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    const ics = await res.text();
    // 4:00 PM in Kochi is 10:30 UTC.
    expect(ics).toContain(`DTSTART:${YEAR}0412T103000Z`);
    expect(ics).toContain(`DTEND:${YEAR}0412T133000Z`);
    expect(ics).toContain('SUMMARY:Mehendi · Nafiya & Irfan');
    expect(ics).toContain('Dress code: Green\\, yellow');

    const other = await calendar(
      request('GET', `/api/public/invitations/${token}/events/${reception}/calendar.ics`),
      params({ token, eventId: reception }),
    );
    expect(other.status).toBe(404);
  });
});

describe('host tools and totals (Atlas test database)', () => {
  it('regenerates a link, marks it shared and counts replies per event', async () => {
    const { admin, weddingId, sharma, token, mehendi, sangeet } = await setup();
    await newFamily(weddingId, admin.cookie, {
      displayName: 'Nair family',
      headcount: 4,
      invitedEvents: [{ eventId: mehendi }],
    });
    await answer(token, [
      { eventId: mehendi, status: 'attending', attendingCount: 3 },
      { eventId: sangeet, status: 'declined' },
    ]);

    const regen = await regenerate(
      request(
        'POST',
        `/api/weddings/${weddingId}/households/${sharma.id}/regenerate-link`,
        admin.cookie,
      ),
      params({ weddingId, householdId: sharma.id }),
    );
    const newLink = (await regen.json()).data.inviteLink as string;
    expect(newLink).not.toBe(sharma.inviteLink);
    expect((await view(token)).status).toBe(404);
    expect((await view(tokenOf(newLink))).status).toBe(200);

    const shared = await markSent(
      request('POST', `/api/weddings/${weddingId}/households/${sharma.id}/mark-sent`, admin.cookie),
      params({ weddingId, householdId: sharma.id }),
    );
    expect((await shared.json()).data).toMatchObject({ inviteStatus: 'sent_manually' });

    const summary = (
      await (
        await rsvpSummary(
          request('GET', `/api/weddings/${weddingId}/rsvp/summary`, admin.cookie),
          params({ weddingId }),
        )
      ).json()
    ).data;
    expect(summary.overall).toMatchObject({
      households: 2,
      sent: 1,
      notSent: 1,
      complete: 1,
      none: 1,
      withoutEmail: 1,
    });
    expect(summary.overall).not.toHaveProperty('_id');
    expect(summary.events.find((e: { eventId: string }) => e.eventId === mehendi)).toEqual({
      eventId: mehendi,
      invitedHouseholds: 2,
      invitedHeadcount: 7,
      respondedHouseholds: 1,
      attendingHouseholds: 1,
      attendingHeadcount: 3,
      declinedHouseholds: 0,
      pendingHouseholds: 1,
    });

    const csv = parseCsv(
      (
        await (
          await rsvpExport(
            request('GET', `/api/weddings/${weddingId}/rsvp/export`, admin.cookie),
            params({ weddingId }),
          )
        ).text()
      ).replace(/^﻿/, ''),
    );
    expect(csv[0]).toContain('Reply');
    const rows = csv.slice(1).filter((r) => r.length > 1);
    expect(rows.map((r) => [r[0], r[2], r[5]])).toEqual([
      ['Mehendi', 'Nair family', 'Waiting'],
      ['Mehendi', 'Sharma family', 'Attending'],
      ['Sangeet', 'Sharma family', 'Not attending'],
    ]);
    // Links are never exported.
    expect(csv.flat().join(' ')).not.toContain('/invited/');
  });

  it("limits totals to a Manager's side and hides other weddings' families", async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie, true);
    const mehendi = await newEvent(weddingId, admin.cookie, 'Mehendi', `${YEAR}-04-12`);
    const bride = await newFamily(weddingId, admin.cookie, {
      displayName: 'Bride side family',
      side: 'bride',
      invitedEvents: [{ eventId: mehendi }],
    });
    await newFamily(weddingId, admin.cookie, {
      displayName: 'Groom side family',
      side: 'groom',
      invitedEvents: [{ eventId: mehendi }],
    });

    const manager = await newUser('Ahmed');
    const invite = await createInvite(
      request('POST', `/api/weddings/${weddingId}/members/invites`, admin.cookie, {
        email: manager.email,
        role: 'manager',
        sideScope: 'groom',
      }),
      params({ weddingId }),
    );
    const joinToken = (await invite.json()).data.inviteLink.split('/join/')[1]!;
    await accept(
      request('POST', `/api/member-invites/${joinToken}/accept`, manager.cookie),
      params({ token: joinToken }),
    );

    const summary = (
      await (
        await rsvpSummary(
          request('GET', `/api/weddings/${weddingId}/rsvp/summary`, manager.cookie),
          params({ weddingId }),
        )
      ).json()
    ).data;
    expect(summary.overall.households).toBe(1);
    expect(summary.sideScope).toBe('groom');

    // A groom-side Manager can't record a reply for a bride-side family.
    const forbidden = await recordRsvp(
      request(
        'PUT',
        `/api/weddings/${weddingId}/households/${bride.id}/rsvps/${mehendi}`,
        manager.cookie,
        { status: 'declined' },
      ),
      params({ weddingId, householdId: bride.id, eventId: mehendi }),
    );
    expect(forbidden.status).toBe(404);

    // Nor can someone from another wedding regenerate this wedding's links.
    const stranger = await newUser('Riya');
    await newWedding(stranger.cookie);
    const other = await regenerate(
      request(
        'POST',
        `/api/weddings/${weddingId}/households/${bride.id}/regenerate-link`,
        stranger.cookie,
      ),
      params({ weddingId, householdId: bride.id }),
    );
    expect(other.status).toBe(404);
  });
});
