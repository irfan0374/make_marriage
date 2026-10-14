import { createHmac } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as runDaily } from '@/app/api/cron/daily/route';
import { POST as processJobs } from '@/app/api/cron/process-jobs/route';
import { PUT as reply } from '@/app/api/public/invitations/[token]/rsvp/route';
import { POST as notifyChange } from '@/app/api/weddings/[weddingId]/events/[eventId]/notify-change/route';
import { PATCH as patchEvent } from '@/app/api/weddings/[weddingId]/events/[eventId]/route';
import { POST as createEvent } from '@/app/api/weddings/[weddingId]/events/route';
import { POST as markSent } from '@/app/api/weddings/[weddingId]/households/[householdId]/mark-sent/route';
import { PUT as recordRsvp } from '@/app/api/weddings/[weddingId]/households/[householdId]/rsvps/[eventId]/route';
import {
  GET as getHousehold,
  PATCH as patchHousehold,
} from '@/app/api/weddings/[weddingId]/households/[householdId]/route';
import {
  GET as listHouseholds,
  POST as createHousehold,
} from '@/app/api/weddings/[weddingId]/households/route';
import { PUT as putInvitation } from '@/app/api/weddings/[weddingId]/invitation/route';
import { POST as send } from '@/app/api/weddings/[weddingId]/invitation/send/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { POST as webhook } from '@/app/api/webhooks/resend/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { clearTestOutbox, testOutbox } from '@/lib/email';
import { collectionSpecs } from '@/modules/collections';
import { queueAutomaticReminders } from '@/modules/invitations';
import { addDays, todayIn } from '@/shared/dates';

// Invitations part 3 against the Atlas test database: delivery webhooks (api-spec §21.3), the
// event-updated email (§10.8), automatic reminders (§21.2) and the reply audit log (DB §7.13).

const YEAR = Number(todayIn('Asia/Kolkata').slice(0, 4)) + 2;
const CRON = `Bearer ${process.env.CRON_SECRET}`;

beforeAll(async () => {
  await applyCollectionSpecs(getDb(), collectionSpecs);
});
beforeEach(async () => {
  clearTestOutbox();
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
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-forwarded-for': `203.0.113.${++counter % 250}`,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function newUser(name: string) {
  const email = `${name.toLowerCase()}.upd.${++counter}.${Date.now()}@example.com`;
  const res = await signup(
    request('POST', '/api/auth/signup', undefined, { name, email, password: 'correct-horse-42' }),
  );
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, email };
}

async function setup() {
  const admin = await newUser('Nafiya');
  const wedding = await createWedding(
    request('POST', '/api/weddings', admin.cookie, {
      brideName: 'Nafiya',
      groomName: 'Irfan',
      weddingDate: `${YEAR}-04-14`,
      city: 'Kochi',
    }),
  );
  const weddingId = (await wedding.json()).data.id as string;
  const event = await createEvent(
    request('POST', `/api/weddings/${weddingId}/events`, admin.cookie, {
      name: 'Mehendi',
      date: `${YEAR}-04-12`,
      startTime: '16:00',
      venueName: 'Family home',
    }),
    params({ weddingId }),
  );
  const mehendi = (await event.json()).data.id as string;
  const family = async (displayName: string, email: string | null, sent: boolean) => {
    const res = await createHousehold(
      request('POST', `/api/weddings/${weddingId}/households`, admin.cookie, {
        displayName,
        email,
        invitedEvents: [{ eventId: mehendi }],
      }),
      params({ weddingId }),
    );
    const doc = (await res.json()).data as { id: string; inviteLink: string };
    if (sent) {
      await markSent(
        request('POST', `/api/weddings/${weddingId}/households/${doc.id}/mark-sent`, admin.cookie),
        params({ weddingId, householdId: doc.id }),
      );
    }
    return doc;
  };
  const sharma = await family('Sharma family', 'sharma@example.com', true);
  const nair = await family('Nair family', 'nair@example.com', false);
  return { admin, weddingId, mehendi, sharma, nair };
}

const runQueue = () =>
  processJobs(
    request('POST', '/api/cron/process-jobs', undefined, undefined, { authorization: CRON }),
  );
const getFamily = async (weddingId: string, id: string, cookie: string) =>
  (
    await (
      await getHousehold(
        request('GET', `/api/weddings/${weddingId}/households/${id}`, cookie),
        params({ weddingId, householdId: id }),
      )
    ).json()
  ).data;
const tokenOf = (link: string) => link.split('/invited/')[1]!;

/** Sign a webhook the way Resend (Svix) does. */
function signed(
  body: string,
  { secret = process.env.RESEND_WEBHOOK_SECRET!, ageSeconds = 0 } = {},
) {
  const id = `msg_${++counter}`;
  const timestamp = String(Math.floor(Date.now() / 1000) - ageSeconds);
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` };
}
const deliver = (type: string, emailId: string, options?: Parameters<typeof signed>[1]) => {
  const body = JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: { email_id: emailId },
  });
  return webhook(request('POST', '/api/webhooks/resend', undefined, body, signed(body, options)));
};

/** Email Sharma the invitation through the queue and return Resend's id for it. */
async function emailSharma(weddingId: string, cookie: string, sharmaId: string) {
  await send(
    request('POST', `/api/weddings/${weddingId}/invitation/send`, cookie, {
      householdIds: [sharmaId],
      resend: true,
    }),
    params({ weddingId }),
  );
  await runQueue();
  const log = await getDb()
    .collection('emailLogs')
    .findOne({ householdId: new ObjectId(sharmaId), template: 'invitation' });
  return log!.providerMessageId as string;
}

describe('delivery webhooks (Atlas test database)', () => {
  it('accepts only correctly signed, recent webhooks', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'unknown' } });
    const ok = await webhook(
      request('POST', '/api/webhooks/resend', undefined, body, signed(body)),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual({ applied: false });

    const wrong = await webhook(
      request(
        'POST',
        '/api/webhooks/resend',
        undefined,
        body,
        signed(body, { secret: `whsec_${Buffer.from('someone-else').toString('base64')}` }),
      ),
    );
    expect(wrong.status).toBe(401);
    const old = await webhook(
      request('POST', '/api/webhooks/resend', undefined, body, signed(body, { ageSeconds: 600 })),
    );
    expect(old.status).toBe(401);
    const tampered = signed(body);
    const changed = await webhook(
      request('POST', '/api/webhooks/resend', undefined, body.replace('unknown', 'x'), tampered),
    );
    expect(changed.status).toBe(401);
    const unsigned = await webhook(request('POST', '/api/webhooks/resend', undefined, body));
    expect(unsigned.status).toBe(401);
  });

  it('records delivery, flags a bounce once, and clears it when the email is corrected', async () => {
    const { admin, weddingId, sharma } = await setup();
    const emailId = await emailSharma(weddingId, admin.cookie, sharma.id);
    const logs = getDb().collection('emailLogs');

    expect((await deliver('email.delivered', emailId)).status).toBe(200);
    expect(await logs.findOne({ providerMessageId: emailId })).toMatchObject({
      status: 'delivered',
    });

    await deliver('email.bounced', emailId);
    await deliver('email.bounced', emailId); // Resend may repeat an event.
    const log = await logs.findOne({ providerMessageId: emailId });
    expect(log!.status).toBe('bounced');
    expect(log!.statusHistory.map((h: { status: string }) => h.status)).toEqual([
      'sent',
      'delivered',
      'bounced',
      'bounced',
    ]);
    // A late "delivered" never hides the bounce.
    await deliver('email.delivered', emailId);
    expect((await logs.findOne({ providerMessageId: emailId }))!.status).toBe('bounced');

    expect((await getFamily(weddingId, sharma.id, admin.cookie)).emailBounced).toBe(true);
    const bounced = await listHouseholds(
      request('GET', `/api/weddings/${weddingId}/households?emailBounced=true`, admin.cookie),
      params({ weddingId }),
    );
    expect((await bounced.json()).data.map((h: { id: string }) => h.id)).toEqual([sharma.id]);
    const retry = await send(
      request('POST', `/api/weddings/${weddingId}/invitation/send`, admin.cookie, {
        householdIds: [sharma.id],
        resend: true,
        dryRun: true,
      }),
      params({ weddingId }),
    );
    expect((await retry.json()).data).toMatchObject({ queued: 0, skippedNoEmail: 1 });

    await patchHousehold(
      request('PATCH', `/api/weddings/${weddingId}/households/${sharma.id}`, admin.cookie, {
        email: 'sharma.new@example.com',
      }),
      params({ weddingId, householdId: sharma.id }),
    );
    expect((await getFamily(weddingId, sharma.id, admin.cookie)).emailBounced).toBe(false);
  });

  it('finishes the family update on a retry if it was lost the first time', async () => {
    const { admin, weddingId, sharma } = await setup();
    const emailId = await emailSharma(weddingId, admin.cookie, sharma.id);
    await deliver('email.bounced', emailId);
    // As if the family update had failed after the log was written.
    const households = getDb().collection('households');
    await households.updateOne({ _id: new ObjectId(sharma.id) }, { $set: { emailBounced: false } });
    // Resend retries the same event: the family is flagged this time.
    expect((await deliver('email.bounced', emailId)).status).toBe(200);
    expect((await getFamily(weddingId, sharma.id, admin.cookie)).emailBounced).toBe(true);
  });

  it('turns reminders off when a family marks an email as spam', async () => {
    const { admin, weddingId, sharma } = await setup();
    const emailId = await emailSharma(weddingId, admin.cookie, sharma.id);
    await deliver('email.complained', emailId);
    const doc = await getDb()
      .collection('households')
      .findOne({ _id: new ObjectId(sharma.id) });
    expect(doc!.remindersOptOut).toBe(true);
    expect(doc!.emailBounced).toBe(false);
  });
});

describe('telling families about an event change (Atlas test database)', () => {
  it('emails the latest details to invited families who were sent the invitation', async () => {
    const { admin, weddingId, mehendi, sharma } = await setup();
    const edited = await patchEvent(
      request('PATCH', `/api/weddings/${weddingId}/events/${mehendi}`, admin.cookie, {
        startTime: '18:30',
        venueName: 'Grand Hyatt',
      }),
      params({ weddingId, eventId: mehendi }),
    );
    expect((await edited.json()).meta).toEqual({ guestFacingChange: true });

    const notify = (dryRun: boolean) =>
      notifyChange(
        request(
          'POST',
          `/api/weddings/${weddingId}/events/${mehendi}/notify-change`,
          admin.cookie,
          {
            dryRun,
          },
        ),
        params({ weddingId, eventId: mehendi }),
      );
    // Nair was never sent the invitation: they'll see the new details when it goes out.
    expect((await (await notify(true)).json()).data).toMatchObject({
      batchId: null,
      queued: 1,
      skippedNotNeeded: 1,
    });
    const res = await notify(false);
    expect(res.status).toBe(202);
    // A second click while it waits queues nothing more.
    expect((await (await notify(false)).json()).data).toMatchObject({
      queued: 0,
      skippedQueued: 1,
    });

    await runQueue();
    expect(testOutbox()).toHaveLength(1);
    const [email] = testOutbox();
    expect(email!.to).toBe('sharma@example.com');
    expect(email!.subject).toContain('Mehendi');
    expect(email!.html).toContain('6:30 PM');
    expect(email!.html).toContain('Grand Hyatt');
    expect(email!.html).toContain(`/invited/${tokenOf(sharma.inviteLink)}`);
  });
});

describe('an update put off by the daily limit (Atlas test database)', () => {
  it('sends the details as they are when it finally goes, not when it was first tried', async () => {
    const { admin, weddingId, mehendi } = await setup();
    const edit = (body: unknown) =>
      patchEvent(
        request('PATCH', `/api/weddings/${weddingId}/events/${mehendi}`, admin.cookie, body),
        params({ weddingId, eventId: mehendi }),
      );
    await edit({ startTime: '18:30' });
    await notifyChange(
      request('POST', `/api/weddings/${weddingId}/events/${mehendi}/notify-change`, admin.cookie, {
        dryRun: false,
      }),
      params({ weddingId, eventId: mehendi }),
    );
    // Today's emails are used up: the notice waits, and nothing about it is saved yet.
    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000);
    const limits = getDb().collection('rateLimits');
    await limits.insertOne({
      key: `email:daily:${now.toISOString().slice(0, 10)}`,
      windowStart,
      count: 100,
      expiresAt: new Date(windowStart.getTime() + 86_460_000),
    });
    expect((await (await runQueue()).json()).data).toMatchObject({ deferred: 1, done: 0 });
    const jobs = getDb().collection('jobs');
    expect((await jobs.findOne({ type: 'event.updated_notice' }))!.sent ?? null).toBeNull();

    // The couple changes the time again meanwhile; the next day it goes with the new time.
    await edit({ startTime: '20:00' });
    await limits.deleteMany({ key: /^email:daily/ });
    await jobs.updateMany({ status: 'queued' }, { $set: { runAfter: new Date(0) } });
    expect((await (await runQueue()).json()).data.done).toBe(1);
    const [email] = testOutbox();
    expect(email!.html).toContain('8:00 PM');
    expect(email!.html).not.toContain('6:30 PM');
  });
});

describe('automatic reminders (Atlas test database)', () => {
  it('reminds families at 9 AM local time, 7 days before the deadline, once', async () => {
    const { admin, weddingId, sharma } = await setup();
    // 9:30 AM in India today, and a deadline 7 days from then.
    const nineThirty = new Date(`${todayIn('Asia/Kolkata')}T04:00:00Z`);
    const deadline = addDays(todayIn('Asia/Kolkata', nineThirty), 7);
    await putInvitation(
      request('PUT', `/api/weddings/${weddingId}/invitation`, admin.cookie, {
        rsvpDeadline: deadline,
        autoRemindersEnabled: true,
      }),
      params({ weddingId }),
    );
    const jobs = getDb().collection('jobs');
    const ours = { weddingId: new ObjectId(weddingId), type: 'rsvp.remind' };

    // At 10:30 AM local nothing goes out.
    await queueAutomaticReminders(new Date(nineThirty.getTime() + 60 * 60_000));
    expect(await jobs.countDocuments(ours)).toBe(0);

    await queueAutomaticReminders(nineThirty);
    expect(await jobs.find(ours).toArray()).toMatchObject([
      { idempotencyKey: `autoremind:${sharma.id}:${deadline}:7`, payload: { side: null } },
    ]);
    // The hourly run again (or a second call) never repeats it.
    await queueAutomaticReminders(nineThirty);
    expect(await jobs.countDocuments(ours)).toBe(1);

    // Turned off: no reminders.
    await jobs.deleteMany(ours);
    await putInvitation(
      request('PUT', `/api/weddings/${weddingId}/invitation`, admin.cookie, {
        autoRemindersEnabled: false,
      }),
      params({ weddingId }),
    );
    await queueAutomaticReminders(nineThirty);
    expect(await jobs.countDocuments(ours)).toBe(0);
  });

  it('needs the cron secret', async () => {
    const res = await runDaily(request('POST', '/api/cron/daily'));
    expect(res.status).toBe(401);
    const ok = await runDaily(
      request('POST', '/api/cron/daily', undefined, undefined, { authorization: CRON }),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toHaveProperty('rsvpRemindersQueued');
  });
});

describe('reply history (Atlas test database)', () => {
  it('records guest replies and replies recorded by the couple', async () => {
    const { admin, weddingId, mehendi, sharma } = await setup();
    const token = tokenOf(sharma.inviteLink);
    await reply(
      request('PUT', `/api/public/invitations/${token}/rsvp`, undefined, {
        responses: [{ eventId: mehendi, status: 'attending', attendingCount: 1 }],
      }),
      params({ token }),
    );
    await recordRsvp(
      request(
        'PUT',
        `/api/weddings/${weddingId}/households/${sharma.id}/rsvps/${mehendi}`,
        admin.cookie,
        { status: 'declined' },
      ),
      params({ weddingId, householdId: sharma.id, eventId: mehendi }),
    );
    const entries = await getDb()
      .collection('auditLogs')
      .find({ targetId: new ObjectId(sharma.id) })
      .sort({ at: 1, _id: 1 })
      .toArray();
    expect(entries.map((e) => [e.action, e.actor.type, e.meta.changes])).toEqual([
      ['rsvp.submitted', 'guest', [{ eventId: mehendi, before: null, after: 'attending:1' }]],
      [
        'rsvp.recorded_by_host',
        'user',
        [{ eventId: mehendi, before: 'attending:1', after: 'declined' }],
      ],
    ]);
    // Never the link or the family's personal details.
    expect(JSON.stringify(entries)).not.toContain(token);
    expect(JSON.stringify(entries)).not.toContain('sharma@example.com');
  });
});
