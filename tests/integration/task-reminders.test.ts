import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as runDaily } from '@/app/api/cron/daily/route';
import { POST as processJobs } from '@/app/api/cron/process-jobs/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { PATCH as patchTask } from '@/app/api/weddings/[weddingId]/tasks/[taskId]/route';
import { POST as createTask } from '@/app/api/weddings/[weddingId]/tasks/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { clearTestOutbox, testOutbox } from '@/lib/email';
import { collectionSpecs } from '@/modules/collections';
import { queueTaskReminders } from '@/modules/tasks';
import { addDays, todayIn } from '@/shared/dates';

// Task due-date reminders (PRD NOTIF-4, api-spec §21.2) against the Atlas test database: one
// morning email per person at 9 AM in the wedding's timezone, listing tasks due today, tomorrow
// and overdue.

const YEAR = Number(todayIn('Asia/Kolkata').slice(0, 4)) + 2;
const CRON = `Bearer ${process.env.CRON_SECRET}`;
const TZ = 'Asia/Kolkata';
/** 9:30 AM in India today. */
const NINE_THIRTY = new Date(`${todayIn(TZ)}T04:00:00Z`);
const TODAY = todayIn(TZ, NINE_THIRTY);

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
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-forwarded-for': `198.18.0.${++counter % 250}`,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function newUser(name: string) {
  const email = `${name.toLowerCase()}.task.${++counter}.${Date.now()}@example.com`;
  const res = await signup(
    request('POST', '/api/auth/signup', undefined, { name, email, password: 'correct-horse-42' }),
  );
  const body = await res.json();
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, email, id: body.data.user.id };
}

async function newWedding(cookie: string, timezone = TZ) {
  const res = await createWedding(
    request('POST', '/api/weddings', cookie, {
      brideName: 'Nafiya',
      groomName: 'Irfan',
      weddingDate: `${YEAR}-04-14`,
      city: 'Kochi',
      timezone,
    }),
  );
  return (await res.json()).data.id as string;
}

async function addTask(weddingId: string, cookie: string, body: Record<string, unknown>) {
  const res = await createTask(
    request('POST', `/api/weddings/${weddingId}/tasks`, cookie, body),
    params({ weddingId }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).data.id as string;
}

/** Run the queue now; jobs queued at the test's 9:30 AM count as due even if that's later today. */
const runQueue = async () => {
  await getDb()
    .collection('jobs')
    .updateMany({ status: 'queued' }, { $set: { runAfter: new Date(0) } });
  const res = await processJobs(
    request('POST', '/api/cron/process-jobs', undefined, undefined, { authorization: CRON }),
  );
  return (await res.json()).data;
};

const jobsFor = (weddingId: string) =>
  getDb()
    .collection('jobs')
    .find({ weddingId: new ObjectId(weddingId), type: 'task.remind' })
    .toArray();

describe('task due-date reminders (Atlas test database)', () => {
  it('emails each person once a morning with tasks due today, tomorrow and overdue', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const mine = (title: string, dueDate: string | null, extra: Record<string, unknown> = {}) =>
      addTask(weddingId, admin.cookie, { title, dueDate, assigneeUserId: admin.id, ...extra });
    const today = await mine('Confirm caterer', TODAY, { priority: 'high' });
    await mine('Pick up invitations', addDays(TODAY, 1));
    await mine('Book mehendi artist', addDays(TODAY, -2));
    await mine('Already done', TODAY, { status: 'done' });
    await mine('Next week', addDays(TODAY, 5));
    await addTask(weddingId, admin.cookie, { title: 'Nobody yet', dueDate: TODAY });

    // Not at 10:30 local.
    await queueTaskReminders(new Date(NINE_THIRTY.getTime() + 60 * 60_000));
    expect(await jobsFor(weddingId)).toHaveLength(0);

    await queueTaskReminders(NINE_THIRTY);
    await queueTaskReminders(NINE_THIRTY); // the hourly run again: no second job
    expect(await jobsFor(weddingId)).toHaveLength(1);

    expect(await runQueue()).toMatchObject({ done: 1 });
    const mail = testOutbox().filter((e) => e.to === admin.email);
    expect(mail).toHaveLength(1);
    const [email] = mail;
    expect(email!.subject).toBe("3 tasks for Nafiya & Irfan's wedding");
    for (const title of ['Confirm caterer', 'Pick up invitations', 'Book mehendi artist']) {
      expect(email!.html).toContain(title);
    }
    expect(email!.html).toContain('High priority');
    expect(email!.html).not.toContain('Already done');
    expect(email!.html).not.toContain('Next week');
    expect(email!.html).not.toContain('Nobody yet');
    expect(email!.html).toContain(`/app/${weddingId}/tasks`);

    const task = await getDb()
      .collection('tasks')
      .findOne({ _id: new ObjectId(today) });
    expect(task!.lastReminderFor).toBe(TODAY);
  });

  it('only reminds about overdue tasks when something is also due today or tomorrow', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    await addTask(weddingId, admin.cookie, {
      title: 'Long overdue',
      dueDate: addDays(TODAY, -3),
      assigneeUserId: admin.id,
    });
    await queueTaskReminders(NINE_THIRTY);
    expect(await jobsFor(weddingId)).toHaveLength(0);
  });

  it('rechecks when sending: finished tasks and people who left drop out', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const manager = await newUser('Ahmed');
    const invite = await createInvite(
      request('POST', `/api/weddings/${weddingId}/members/invites`, admin.cookie, {
        email: manager.email,
        role: 'manager',
        sideScope: 'both',
      }),
      params({ weddingId }),
    );
    const joinToken = (await invite.json()).data.inviteLink.split('/join/')[1]!;
    await accept(
      request('POST', `/api/member-invites/${joinToken}/accept`, manager.cookie),
      params({ token: joinToken }),
    );
    const adminTask = await addTask(weddingId, admin.cookie, {
      title: 'Order flowers',
      dueDate: TODAY,
      assigneeUserId: admin.id,
    });
    await addTask(weddingId, admin.cookie, {
      title: 'Book the band',
      dueDate: addDays(TODAY, 1),
      assigneeUserId: manager.id,
    });
    await queueTaskReminders(NINE_THIRTY);
    expect(await jobsFor(weddingId)).toHaveLength(2);
    clearTestOutbox();

    // Before the queue runs: the admin finishes their task, and the manager leaves the team.
    await patchTask(
      request('PATCH', `/api/weddings/${weddingId}/tasks/${adminTask}`, admin.cookie, {
        status: 'done',
      }),
      params({ weddingId, taskId: adminTask }),
    );
    await getDb()
      .collection('memberships')
      .deleteOne({ weddingId: new ObjectId(weddingId), userId: new ObjectId(manager.id) });

    await runQueue();
    // Other tests' weddings in this database may get theirs; this wedding's are both skipped.
    expect((await jobsFor(weddingId)).map((job) => job.status)).toEqual(['skipped', 'skipped']);
    expect(testOutbox().filter((e) => [admin.email, manager.email].includes(e.to))).toHaveLength(0);
  });

  it("uses each wedding's own morning", async () => {
    const admin = await newUser('Riya');
    // 9:30 AM in India is 5:30 AM in London.
    const weddingId = await newWedding(admin.cookie, 'Europe/London');
    await addTask(weddingId, admin.cookie, {
      title: 'Hire photographer',
      dueDate: todayIn('Europe/London', NINE_THIRTY),
      assigneeUserId: admin.id,
    });
    await queueTaskReminders(NINE_THIRTY);
    expect(await jobsFor(weddingId)).toHaveLength(0);
  });

  it('runs from the hourly scheduled route with the cron secret', async () => {
    const res = await runDaily(
      request('POST', '/api/cron/daily', undefined, undefined, { authorization: CRON }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveProperty('taskRemindersQueued');
  });
});
