import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as processJobs } from '@/app/api/cron/process-jobs/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import { GET as card } from '@/app/api/public/invitations/[token]/card/route';
import { POST as stopReminders } from '@/app/api/public/invitations/[token]/stop-reminders/route';
import { PUT as reply } from '@/app/api/public/invitations/[token]/rsvp/route';
import { POST as createEvent } from '@/app/api/weddings/[weddingId]/events/route';
import { POST as markSent } from '@/app/api/weddings/[weddingId]/households/[householdId]/mark-sent/route';
import { GET as getHousehold } from '@/app/api/weddings/[weddingId]/households/[householdId]/route';
import { POST as createHousehold } from '@/app/api/weddings/[weddingId]/households/route';
import { POST as cancelBatch } from '@/app/api/weddings/[weddingId]/invitation/batches/[batchId]/cancel/route';
import { GET as getBatch } from '@/app/api/weddings/[weddingId]/invitation/batches/[batchId]/route';
import { GET as listBatches } from '@/app/api/weddings/[weddingId]/invitation/batches/route';
import { POST as remind } from '@/app/api/weddings/[weddingId]/invitation/remind/route';
import { PUT as putInvitation } from '@/app/api/weddings/[weddingId]/invitation/route';
import { POST as send } from '@/app/api/weddings/[weddingId]/invitation/send/route';
import { POST as testInvitation } from '@/app/api/weddings/[weddingId]/invitation/test/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { clearTestOutbox, failTestEmails, testOutbox } from '@/lib/email';
import { testObjects } from '@/lib/r2';
import { collectionSpecs } from '@/modules/collections';
import { todayIn } from '@/shared/dates';

// Sending invitations and reminders by email through the job queue (api-spec §10.4–10.7,
// §21.1) against the Atlas test database.

const YEAR = Number(todayIn('Asia/Kolkata').slice(0, 4)) + 2;
const CRON = `Bearer ${process.env.CRON_SECRET}`;

beforeAll(async () => {
  await applyCollectionSpecs(getDb(), collectionSpecs);
});
beforeEach(async () => {
  clearTestOutbox();
  // Each test starts with an empty queue and a fresh daily email count.
  await getDb().collection('jobs').deleteMany({});
  await getDb()
    .collection('rateLimits')
    .deleteMany({ key: /^email:daily/ });
});

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
      'x-forwarded-for': `192.0.2.${++counter % 250}`,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function newUser(name: string) {
  const email = `${name.toLowerCase()}.send.${++counter}.${Date.now()}@example.com`;
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
  return (await res.json()).data.id;
}

async function newEvent(weddingId: string, cookie: string) {
  const res = await createEvent(
    request('POST', `/api/weddings/${weddingId}/events`, cookie, {
      name: 'Mehendi',
      date: `${YEAR}-04-12`,
      startTime: '16:00',
    }),
    params({ weddingId }),
  );
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

const family = async (weddingId: string, id: string, cookie: string) =>
  (
    await (
      await getHousehold(
        request('GET', `/api/weddings/${weddingId}/households/${id}`, cookie),
        params({ weddingId, householdId: id }),
      )
    ).json()
  ).data;

const sendTo = (weddingId: string, cookie: string, body: unknown) =>
  send(
    request('POST', `/api/weddings/${weddingId}/invitation/send`, cookie, body),
    params({ weddingId }),
  );
const remindTo = (weddingId: string, cookie: string, body: unknown) =>
  remind(
    request('POST', `/api/weddings/${weddingId}/invitation/remind`, cookie, body),
    params({ weddingId }),
  );
const runQueue = async (authorization = CRON) => {
  const res = await processJobs(
    request('POST', '/api/cron/process-jobs', undefined, undefined, { authorization }),
  );
  return { status: res.status, body: await res.json() };
};
const tokenOf = (link: string) => link.split('/invited/')[1]!;

async function setup() {
  const admin = await newUser('Nafiya');
  const weddingId = await newWedding(admin.cookie);
  const mehendi = await newEvent(weddingId, admin.cookie);
  const sharma = await newFamily(weddingId, admin.cookie, {
    displayName: 'Sharma family',
    email: 'sharma@example.com',
    invitedEvents: [{ eventId: mehendi }],
  });
  const nair = await newFamily(weddingId, admin.cookie, {
    displayName: 'Nair family',
    invitedEvents: [{ eventId: mehendi }],
  });
  const khan = await newFamily(weddingId, admin.cookie, {
    displayName: 'Khan family',
    email: 'khan@example.com',
  });
  const iyer = await newFamily(weddingId, admin.cookie, {
    displayName: 'Iyer family',
    email: 'iyer@example.com',
    invitedEvents: [{ eventId: mehendi }],
  });
  await markSent(
    request('POST', `/api/weddings/${weddingId}/households/${iyer.id}/mark-sent`, admin.cookie),
    params({ weddingId, householdId: iyer.id }),
  );
  return { admin, weddingId, mehendi, sharma, nair, khan, iyer };
}

describe('sending invitations by email (Atlas test database)', () => {
  it('counts first, then queues and sends each family exactly once', async () => {
    const { admin, weddingId, sharma, nair } = await setup();

    const dry = await sendTo(weddingId, admin.cookie, { filter: 'all_not_sent', dryRun: true });
    expect(dry.status).toBe(200);
    expect((await dry.json()).data).toMatchObject({
      batchId: null,
      queued: 1,
      skippedNoEmail: 1,
      skippedNoEvents: 1,
      estimatedDays: 1,
    });
    expect((await family(weddingId, sharma.id, admin.cookie)).inviteStatus).toBe('not_sent');

    const res = await sendTo(weddingId, admin.cookie, { filter: 'all_not_sent' });
    expect(res.status).toBe(202);
    const { batchId, queued } = (await res.json()).data;
    expect(queued).toBe(1);
    expect((await family(weddingId, sharma.id, admin.cookie)).inviteStatus).toBe('queued');
    expect((await family(weddingId, nair.id, admin.cookie)).inviteStatus).toBe('not_sent');

    // Sending again while it waits queues nothing new.
    const again = await sendTo(weddingId, admin.cookie, { householdIds: [sharma.id] });
    expect((await again.json()).data).toMatchObject({ queued: 0, skippedQueued: 1 });

    expect((await runQueue('Bearer wrong')).status).toBe(401);
    expect((await runQueue('')).status).toBe(401);

    const run = await runQueue();
    expect(run.status).toBe(200);
    expect(run.body.data).toMatchObject({ claimed: 1, done: 1, retried: 0, failed: 0 });
    expect(testOutbox()).toHaveLength(1);
    const [email] = testOutbox();
    expect(email!.to).toBe('sharma@example.com');
    expect(email!.html).toContain(`/invited/${tokenOf(sharma.inviteLink)}`);
    const sent = await family(weddingId, sharma.id, admin.cookie);
    expect(sent.inviteStatus).toBe('sent');
    expect(sent.sentAt).not.toBeNull();

    // A second run finds nothing: never sent twice.
    expect((await runQueue()).body.data.claimed).toBe(0);
    expect(testOutbox()).toHaveLength(1);

    const progress = await getBatch(
      request('GET', `/api/weddings/${weddingId}/invitation/batches/${batchId}`, admin.cookie),
      params({ weddingId, batchId }),
    );
    expect((await progress.json()).data).toMatchObject({
      batchId,
      type: 'invitation.send',
      total: 1,
      sent: 1,
      waiting: 0,
    });
  });

  it('resends only when asked, and puts the card in the email', async () => {
    const { admin, weddingId, iyer } = await setup();
    const key = `weddings/${weddingId}/invitation/card.jpg`;
    // A real JPEG starts with FF D8 FF: the upload check reads the first bytes.
    testObjects().set(key, {
      sizeBytes: 1000,
      contentType: 'image/jpeg',
      firstBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
    });
    const saved = await putInvitation(
      request('PUT', `/api/weddings/${weddingId}/invitation`, admin.cookie, { mediaKey: key }),
      params({ weddingId }),
    );
    expect(saved.status).toBe(200);

    const skipped = await sendTo(weddingId, admin.cookie, { householdIds: [iyer.id] });
    expect((await skipped.json()).data).toMatchObject({ queued: 0, skippedAlreadySent: 1 });
    const resent = await sendTo(weddingId, admin.cookie, { householdIds: [iyer.id], resend: true });
    expect((await resent.json()).data.queued).toBe(1);
    await runQueue();

    const token = tokenOf(iyer.inviteLink);
    expect(testOutbox()[0]!.html).toContain(`/api/public/invitations/${token}/card`);
    const image = await card(
      request('GET', `/api/public/invitations/${token}/card`),
      params({ token }),
    );
    expect(image.status).toBe(302);
    expect(image.headers.get('location')).toContain('card.jpg');
    expect((await family(weddingId, iyer.id, admin.cookie)).inviteStatus).toBe('sent');
  });

  it('cancels emails not sent yet and restores each family', async () => {
    const { admin, weddingId, sharma, iyer } = await setup();
    const res = await sendTo(weddingId, admin.cookie, {
      householdIds: [sharma.id, iyer.id],
      resend: true,
    });
    const { batchId } = (await res.json()).data;

    const cancelled = await cancelBatch(
      request(
        'POST',
        `/api/weddings/${weddingId}/invitation/batches/${batchId}/cancel`,
        admin.cookie,
      ),
      params({ weddingId, batchId }),
    );
    expect((await cancelled.json()).data).toMatchObject({ total: 2, cancelled: 2, waiting: 0 });
    expect((await family(weddingId, sharma.id, admin.cookie)).inviteStatus).toBe('not_sent');
    expect((await family(weddingId, iyer.id, admin.cookie)).inviteStatus).toBe('sent_manually');

    expect((await runQueue()).body.data.claimed).toBe(0);
    expect(testOutbox()).toHaveLength(0);

    const recent = await listBatches(
      request('GET', `/api/weddings/${weddingId}/invitation/batches`, admin.cookie),
      params({ weddingId }),
    );
    expect((await recent.json()).data[0]).toMatchObject({ batchId, cancelled: 2 });
  });

  it('retries a failed email, then marks the family failed', async () => {
    const { admin, weddingId, sharma } = await setup();
    await sendTo(weddingId, admin.cookie, { householdIds: [sharma.id] });
    failTestEmails(true);
    const jobs = getDb().collection('jobs');

    const first = await runQueue();
    expect(first.body.data).toMatchObject({ claimed: 1, retried: 1 });
    expect((await family(weddingId, sharma.id, admin.cookie)).inviteStatus).toBe('queued');
    // Skip the back-off wait twice.
    for (const expected of ['retried', 'failed'] as const) {
      await jobs.updateMany({ status: 'queued' }, { $set: { runAfter: new Date(0) } });
      expect((await runQueue()).body.data[expected]).toBe(1);
    }
    failTestEmails(false);
    expect((await family(weddingId, sharma.id, admin.cookie)).inviteStatus).toBe('failed');
    const job = await jobs.findOne({});
    expect(job).toMatchObject({ status: 'failed', attempts: 3 });

    // A failed family can be sent again.
    const retry = await sendTo(weddingId, admin.cookie, { filter: 'all_not_sent' });
    expect((await retry.json()).data.queued).toBe(1);
  });

  it('holds emails over the daily limit until tomorrow', async () => {
    const { admin, weddingId, sharma } = await setup();
    await sendTo(weddingId, admin.cookie, { householdIds: [sharma.id] });
    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000);
    await getDb()
      .collection('rateLimits')
      .insertOne({
        key: `email:daily:${now.toISOString().slice(0, 10)}`,
        windowStart,
        count: 100,
        expiresAt: new Date(windowStart.getTime() + 86_460_000),
      });

    const run = await runQueue();
    expect(run.body.data).toMatchObject({
      claimed: 0,
      done: 0,
      deferred: 1,
      dailyEmailRemaining: 0,
    });
    expect(testOutbox()).toHaveLength(0);
    const job = await getDb().collection('jobs').findOne({});
    expect(job).toMatchObject({ status: 'queued', attempts: 0 });
    expect(job!.runAfter.getTime()).toBe(windowStart.getTime() + 86_400_000);

    const dry = await sendTo(weddingId, admin.cookie, {
      householdIds: [sharma.id],
      dryRun: true,
    });
    expect((await dry.json()).data.skippedQueued).toBe(1);
  });

  it('counts emails sent straight from a request against the daily limit', async () => {
    const { admin, weddingId } = await setup();
    expect((await runQueue()).body.data.dailyEmailRemaining).toBe(100);
    const test = await testInvitation(
      request('POST', `/api/weddings/${weddingId}/invitation/test`, admin.cookie),
      params({ weddingId }),
    );
    expect(test.status).toBe(200);
    expect((await runQueue()).body.data.dailyEmailRemaining).toBe(99);

    // At the limit, a direct email is refused too instead of going over it.
    await getDb()
      .collection('rateLimits')
      .updateOne({ key: /^email:daily/ }, { $set: { count: 100 } });
    const over = await testInvitation(
      request('POST', `/api/weddings/${weddingId}/invitation/test`, admin.cookie),
      params({ weddingId }),
    );
    expect((await over.json()).error.code).toBe('EMAIL_SEND_FAILED');
    expect(testOutbox()).toHaveLength(1);
  });

  it('retries with exactly the email of the first attempt', async () => {
    const { admin, weddingId, sharma } = await setup();
    await sendTo(weddingId, admin.cookie, { householdIds: [sharma.id] });
    failTestEmails(true);
    expect((await runQueue()).body.data.retried).toBe(1);
    failTestEmails(false);
    const jobs = getDb().collection('jobs');
    const job = await jobs.findOne({});
    expect(job!.sent).toMatchObject({ to: 'sharma@example.com' });

    // The couple edits the message before the retry: the retry still sends the first version.
    await putInvitation(
      request('PUT', `/api/weddings/${weddingId}/invitation`, admin.cookie, {
        message: 'A brand new message',
      }),
      params({ weddingId }),
    );
    await jobs.updateMany({ status: 'queued' }, { $set: { runAfter: new Date(0) } });
    expect((await runQueue()).body.data.done).toBe(1);
    const [email] = testOutbox();
    expect(email!.html).not.toContain('A brand new message');
    expect(email!.html).toContain(job!.sent.props.message.slice(0, 20));
  });

  it('needs a card or a message before sending', async () => {
    const { admin, weddingId } = await setup();
    await putInvitation(
      request('PUT', `/api/weddings/${weddingId}/invitation`, admin.cookie, { message: '' }),
      params({ weddingId }),
    );
    const res = await sendTo(weddingId, admin.cookie, { filter: 'all_not_sent' });
    expect((await res.json()).error.code).toBe('INVITATION_NOT_READY');
  });
});

describe('reminders and side limits (Atlas test database)', () => {
  // In setup, Iyer was shared by hand and hasn't replied: the one family a reminder can reach.
  const remindable = setup;

  it('never queues a second reminder while one is waiting', async () => {
    const { admin, weddingId, iyer } = await remindable();
    const [a, b] = await Promise.all([
      remindTo(weddingId, admin.cookie, { filter: 'all_incomplete' }),
      remindTo(weddingId, admin.cookie, { householdIds: [iyer.id] }),
    ]);
    const queued = [(await a.json()).data, (await b.json()).data];
    expect(queued.reduce((n, r) => n + r.queued, 0)).toBe(1);
    const again = await remindTo(weddingId, admin.cookie, { filter: 'all_incomplete' });
    expect((await again.json()).data).toMatchObject({ queued: 0, skippedQueued: 1 });
    expect(await getDb().collection('jobs').countDocuments({ type: 'rsvp.remind' })).toBe(1);

    // Once it has gone out, a later reminder is allowed again.
    await runQueue();
    const later = await remindTo(weddingId, admin.cookie, { filter: 'all_incomplete' });
    expect((await later.json()).data.queued).toBe(1);
  });

  it('skips a reminder no longer needed without counting it as sent', async () => {
    const { admin, weddingId, mehendi, iyer } = await remindable();
    const res = await remindTo(weddingId, admin.cookie, { householdIds: [iyer.id] });
    const { batchId } = (await res.json()).data;
    // The family replies before the queue runs.
    const token = tokenOf(iyer.inviteLink);
    await reply(
      request('PUT', `/api/public/invitations/${token}/rsvp`, undefined, {
        responses: [{ eventId: mehendi, status: 'declined' }],
      }),
      params({ token }),
    );
    clearTestOutbox();
    const before = (await runQueue()).body.data;
    expect(before).toMatchObject({ claimed: 1, done: 0, skipped: 1 });
    expect(testOutbox()).toHaveLength(0);
    // The RSVP confirmation used one email; the skipped reminder used none.
    expect(before.dailyEmailRemaining).toBe(99);
    const progress = await getBatch(
      request('GET', `/api/weddings/${weddingId}/invitation/batches/${batchId}`, admin.cookie),
      params({ weddingId, batchId }),
    );
    expect((await progress.json()).data).toMatchObject({ total: 1, sent: 0, skipped: 1 });
    expect((await family(weddingId, iyer.id, admin.cookie)).reminderCount).toBe(0);
  });

  it('reminds only invited families that still owe a reply', async () => {
    const { admin, weddingId, mehendi, sharma, iyer } = await setup();
    const extra = await newFamily(weddingId, admin.cookie, {
      displayName: 'Menon family',
      email: 'menon@example.com',
      invitedEvents: [{ eventId: mehendi }],
    });
    await markSent(
      request('POST', `/api/weddings/${weddingId}/households/${extra.id}/mark-sent`, admin.cookie),
      params({ weddingId, householdId: extra.id }),
    );
    // Iyer has replied to everything; Menon turned reminders off; Sharma was never sent.
    const iyerToken = tokenOf(iyer.inviteLink);
    await reply(
      request('PUT', `/api/public/invitations/${iyerToken}/rsvp`, undefined, {
        responses: [{ eventId: mehendi, status: 'declined' }],
      }),
      params({ token: iyerToken }),
    );
    const menonToken = tokenOf(extra.inviteLink);
    await stopReminders(
      request('POST', `/api/public/invitations/${menonToken}/stop-reminders`),
      params({ token: menonToken }),
    );
    clearTestOutbox();

    const none = await remindTo(weddingId, admin.cookie, { filter: 'all_incomplete' });
    expect((await none.json()).data).toMatchObject({ queued: 0, skippedNotNeeded: 2 });

    // With reminders allowed again, Menon is the one family that should get one.
    await getDb()
      .collection('households')
      .updateOne({ _id: new ObjectId(extra.id) }, { $set: { remindersOptOut: false } });
    const res = await remindTo(weddingId, admin.cookie, { filter: 'all_incomplete' });
    expect(res.status).toBe(202);
    expect((await res.json()).data.queued).toBe(1);
    await runQueue();
    expect(testOutbox().map((e) => e.to)).toEqual(['menon@example.com']);
    expect(testOutbox()[0]!.html).toContain('#stop-reminders');
    const menon = await family(weddingId, extra.id, admin.cookie);
    expect(menon.reminderCount).toBe(1);
    expect((await family(weddingId, sharma.id, admin.cookie)).reminderCount).toBe(0);
  });

  it("sends only a side-limited Manager's own families", async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie, true);
    const mehendi = await newEvent(weddingId, admin.cookie);
    for (const side of ['bride', 'groom']) {
      await newFamily(weddingId, admin.cookie, {
        displayName: `${side} family`,
        email: `${side}@example.com`,
        side,
        invitedEvents: [{ eventId: mehendi }],
      });
    }
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
    clearTestOutbox(); // the team invite email

    const res = await sendTo(weddingId, manager.cookie, { filter: 'all_not_sent' });
    const { batchId, queued } = (await res.json()).data;
    expect(queued).toBe(1);
    await runQueue();
    expect(testOutbox().map((e) => e.to)).toEqual(['groom@example.com']);

    // Someone from another wedding can't see it at all.
    const stranger = await newUser('Riya');
    await newWedding(stranger.cookie);
    const other = await getBatch(
      request('GET', `/api/weddings/${weddingId}/invitation/batches/${batchId}`, stranger.cookie),
      params({ weddingId, batchId }),
    );
    expect(other.status).toBe(404);
  });
});
