import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import { DELETE as deleteEvent } from '@/app/api/weddings/[weddingId]/events/[eventId]/route';
import { POST as createEvent } from '@/app/api/weddings/[weddingId]/events/route';
import { DELETE as removeMember } from '@/app/api/weddings/[weddingId]/members/[memberId]/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { GET as getTeam } from '@/app/api/weddings/[weddingId]/members/route';
import {
  DELETE as deleteTask,
  PATCH as patchTask,
} from '@/app/api/weddings/[weddingId]/tasks/[taskId]/route';
import { GET as listTasks, POST as createTask } from '@/app/api/weddings/[weddingId]/tasks/route';
import {
  GET as getStarter,
  POST as addStarter,
} from '@/app/api/weddings/[weddingId]/tasks/starter-checklist/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { MAX_TASKS_PER_WEDDING } from '@/config/constants';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { clearTestOutbox, testOutbox } from '@/lib/email';
import { collectionSpecs } from '@/modules/collections';
import { addDays, todayIn } from '@/shared/dates';

// Tasks end to end against the Atlas test database (api-spec §12). Email goes to the in-memory
// test outbox, never to Resend.

const TODAY = todayIn('Asia/Kolkata');
const YEAR = Number(TODAY.slice(0, 4)) + 2;

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
      'x-forwarded-for': `192.0.2.${++counter % 250}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function newUser(name: string) {
  const email = `${name.toLowerCase()}.${++counter}.${Date.now()}@example.com`;
  const res = await signup(
    request('POST', '/api/auth/signup', undefined, { name, email, password: 'correct-horse-42' }),
  );
  expect(res.status).toBe(201);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const me = await res.json();
  return { cookie, email, userId: me.data.user.id as string };
}

async function newWedding(cookie: string, weddingDate = `${YEAR}-04-14`): Promise<string> {
  const res = await createWedding(
    request('POST', '/api/weddings', cookie, {
      brideName: 'Nafiya',
      groomName: 'Irfan',
      weddingDate,
      city: 'Kochi',
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).data.id;
}

/** A Manager on the wedding, through the real invite and join flow. */
async function newManager(weddingId: string, adminCookie: string, name = 'Ahmed') {
  const manager = await newUser(name);
  const res = await createInvite(
    request('POST', `/api/weddings/${weddingId}/members/invites`, adminCookie, {
      email: manager.email,
      role: 'manager',
    }),
    params({ weddingId }),
  );
  const token = (await res.json()).data.inviteLink.split('/join/')[1]!;
  const joined = await accept(
    request('POST', `/api/member-invites/${token}/accept`, manager.cookie),
    params({ token }),
  );
  expect(joined.status).toBe(200);
  clearTestOutbox();
  return manager;
}

const base = (weddingId: string) => `/api/weddings/${weddingId}/tasks`;
const add = (weddingId: string, cookie: string, body: unknown) =>
  createTask(request('POST', base(weddingId), cookie, body), params({ weddingId }));
const list = async (weddingId: string, cookie: string, query = '') => {
  const res = await listTasks(
    request('GET', `${base(weddingId)}${query}`, cookie),
    params({ weddingId }),
  );
  return { status: res.status, body: await res.json() };
};
const patch = (weddingId: string, taskId: string, cookie: string, body: unknown) =>
  patchTask(
    request('PATCH', `${base(weddingId)}/${taskId}`, cookie, body),
    params({ weddingId, taskId }),
  );
const remove = (weddingId: string, taskId: string, cookie: string) =>
  deleteTask(
    request('DELETE', `${base(weddingId)}/${taskId}`, cookie),
    params({ weddingId, taskId }),
  );

describe('tasks (Atlas test database)', () => {
  it('adds, edits, completes and deletes a task', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);

    const res = await add(weddingId, admin.cookie, {
      title: '  Book the photographer ',
      dueDate: `${YEAR}-01-10`,
    });
    expect(res.status).toBe(201);
    const task = (await res.json()).data;
    expect(task).toMatchObject({
      title: 'Book the photographer',
      description: '',
      status: 'todo',
      assignee: null,
      eventId: null,
      completedAt: null,
      createdBy: { userId: admin.userId, name: 'Nafiya' },
      source: 'manual',
    });

    const done = await patch(weddingId, task.id, admin.cookie, { status: 'done' });
    expect((await done.json()).data.completedAt).not.toBeNull();
    const reopened = await patch(weddingId, task.id, admin.cookie, { status: 'in_progress' });
    expect((await reopened.json()).data).toMatchObject({
      status: 'in_progress',
      completedAt: null,
    });

    expect((await remove(weddingId, task.id, admin.cookie)).status).toBe(204);
    expect((await list(weddingId, admin.cookie)).body.data).toEqual([]);
    expect((await remove(weddingId, task.id, admin.cookie)).status).toBe(404);
  });

  it('assigns to team members only, and emails them (not yourself)', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const manager = await newManager(weddingId, admin.cookie);
    const outsider = await newUser('Meera');

    const own = await add(weddingId, admin.cookie, {
      title: 'Pick outfits',
      assigneeUserId: admin.userId,
    });
    expect(own.status).toBe(201);
    expect(testOutbox()).toHaveLength(0);

    const res = await add(weddingId, admin.cookie, {
      title: 'Book mehendi artist',
      dueDate: `${YEAR}-03-01`,
      assigneeUserId: manager.userId,
    });
    expect((await res.json()).data.assignee).toEqual({ userId: manager.userId, name: 'Ahmed' });
    expect(testOutbox()).toHaveLength(1);
    const [sent] = testOutbox();
    expect(sent).toMatchObject({
      to: manager.email,
      subject: 'Nafiya assigned you: Book mehendi artist',
    });
    expect(sent!.html).toContain(`/app/${weddingId}/tasks`);

    const stranger = await add(weddingId, admin.cookie, {
      title: 'X',
      assigneeUserId: outsider.userId,
    });
    expect(stranger.status).toBe(400);
    expect((await stranger.json()).error.code).toBe('ASSIGNEE_NOT_MEMBER');

    // Re-saving the same assignee doesn't email again; changing it does.
    const ownTask = (await own.json()).data;
    clearTestOutbox();
    await patch(weddingId, ownTask.id, admin.cookie, { assigneeUserId: admin.userId });
    expect(testOutbox()).toHaveLength(0);
    await patch(weddingId, ownTask.id, admin.cookie, { assigneeUserId: manager.userId });
    expect(testOutbox()).toHaveLength(1);
  });

  it('filters by status, assignee, event and due date', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const manager = await newManager(weddingId, admin.cookie);
    const ev = await createEvent(
      request('POST', `/api/weddings/${weddingId}/events`, admin.cookie, {
        name: 'Sangeet',
        date: `${YEAR}-04-13`,
        startTime: '19:00',
      }),
      params({ weddingId }),
    );
    const eventId = (await ev.json()).data.id;

    const make = async (body: object) =>
      (await (await add(weddingId, admin.cookie, body)).json()).data;
    const overdue = await make({ title: 'Overdue', dueDate: addDays(TODAY, -2) });
    const soon = await make({
      title: 'Soon',
      dueDate: addDays(TODAY, 3),
      assigneeUserId: manager.userId,
    });
    const later = await make({ title: 'Later', dueDate: addDays(TODAY, 30), eventId });
    const undated = await make({ title: 'Undated', status: 'done' });

    const titles = (body: { data: { title: string }[] }) => body.data.map((t) => t.title);
    // Due date first, tasks without one last.
    expect(titles((await list(weddingId, admin.cookie)).body)).toEqual([
      overdue.title,
      soon.title,
      later.title,
      undated.title,
    ]);
    expect(titles((await list(weddingId, admin.cookie, '?due=overdue')).body)).toEqual(['Overdue']);
    expect(titles((await list(weddingId, admin.cookie, '?due=this_week')).body)).toEqual(['Soon']);
    expect(titles((await list(weddingId, admin.cookie, '?due=none')).body)).toEqual(['Undated']);
    expect(titles((await list(weddingId, admin.cookie, '?status=done')).body)).toEqual(['Undated']);
    expect(titles((await list(weddingId, admin.cookie, `?eventId=${eventId}`)).body)).toEqual([
      'Later',
    ]);
    expect(titles((await list(weddingId, manager.cookie, '?assignee=me')).body)).toEqual(['Soon']);
    expect((await list(weddingId, admin.cookie, '?assignee=none')).body.data).toHaveLength(3);

    // Pages carry a cursor.
    const page = await list(weddingId, admin.cookie, '?limit=2');
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta.nextCursor).toBe('2');
    const next = await list(weddingId, admin.cookie, `?limit=2&cursor=2`);
    expect(titles(next.body)).toEqual(['Later', 'Undated']);
    expect(next.body.meta.nextCursor).toBeNull();

    expect((await list(weddingId, admin.cookie, '?status=maybe')).status).toBe(400);
  });

  it('only links events of this wedding, and keeps tasks when their event is deleted', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const other = await newUser('Meera');
    const otherWeddingId = await newWedding(other.cookie);
    const mk = (wid: string, cookie: string) =>
      createEvent(
        request('POST', `/api/weddings/${wid}/events`, cookie, {
          name: 'Haldi',
          date: `${YEAR}-04-12`,
          startTime: '09:30',
        }),
        params({ weddingId: wid }),
      ).then(async (r) => (await r.json()).data.id as string);
    const eventId = await mk(weddingId, admin.cookie);
    const foreignEventId = await mk(otherWeddingId, other.cookie);

    const bad = await add(weddingId, admin.cookie, { title: 'X', eventId: foreignEventId });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.details).toEqual([
      { path: 'eventId', message: 'Choose one of this wedding’s events' },
    ]);

    const task = (
      await (await add(weddingId, admin.cookie, { title: 'Haldi flowers', eventId })).json()
    ).data;
    expect(task.eventId).toBe(eventId);
    const deleted = await deleteEvent(
      request('DELETE', `/api/weddings/${weddingId}/events/${eventId}`, admin.cookie),
      params({ weddingId, eventId }),
    );
    expect(deleted.status).toBe(204);
    const [kept] = (await list(weddingId, admin.cookie)).body.data;
    expect(kept).toMatchObject({ id: task.id, title: 'Haldi flowers', eventId: null });
  });

  it('unassigns tasks when someone leaves the team', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const manager = await newManager(weddingId, admin.cookie);
    const task = (
      await (
        await add(weddingId, admin.cookie, { title: 'Book DJ', assigneeUserId: manager.userId })
      ).json()
    ).data;

    const team = await (
      await getTeam(
        request('GET', `/api/weddings/${weddingId}/members`, admin.cookie),
        params({ weddingId }),
      )
    ).json();
    const memberId = team.data.members.find(
      (m: { user: { id: string } }) => m.user.id === manager.userId,
    ).id;
    const removed = await removeMember(
      request('DELETE', `/api/weddings/${weddingId}/members/${memberId}`, admin.cookie),
      params({ weddingId, memberId }),
    );
    expect(removed.status).toBe(204);

    const [after] = (await list(weddingId, admin.cookie)).body.data;
    expect(after).toMatchObject({ id: task.id, assignee: null });
    const stored = await getDb()
      .collection('tasks')
      .findOne({ _id: ObjectId.createFromHexString(task.id) });
    expect(stored?.assigneeUserId).toBeNull();
  });

  it('clears stored assignments when assignment races with member removal', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const manager = await newManager(weddingId, admin.cookie);
    const team = await (
      await getTeam(
        request('GET', `/api/weddings/${weddingId}/members`, admin.cookie),
        params({ weddingId }),
      )
    ).json();
    const memberId = team.data.members.find(
      (m: { user: { id: string } }) => m.user.id === manager.userId,
    ).id;
    const responses = await Promise.all([
      add(weddingId, admin.cookie, { title: 'Call florist', assigneeUserId: manager.userId }),
      removeMember(
        request('DELETE', `/api/weddings/${weddingId}/members/${memberId}`, admin.cookie),
        params({ weddingId, memberId }),
      ),
    ]);
    expect([201, 400]).toContain(responses[0].status);
    expect(responses[1].status).toBe(204);
    const docs = await getDb()
      .collection('tasks')
      .find({ weddingId: ObjectId.createFromHexString(weddingId) })
      .toArray();
    expect(docs.every((doc) => doc.assigneeUserId === null)).toBe(true);
  });

  it('adds starter tasks with due dates counted back from the wedding, once', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie, `${YEAR}-04-14`);
    const starter = async () =>
      (
        await (
          await getStarter(
            request('GET', `${base(weddingId)}/starter-checklist`, admin.cookie),
            params({ weddingId }),
          )
        ).json()
      ).data;

    const items = await starter();
    const venue = items.find((i: { key: string }) => i.key === 'book_venue');
    expect(venue).toMatchObject({
      title: 'Book the venue',
      suggestedMonthsBefore: 10,
      dueDate: `${YEAR - 1}-06-14`,
      alreadyAdded: false,
    });

    const added = await addStarter(
      request('POST', `${base(weddingId)}/starter-checklist`, admin.cookie, {
        keys: ['book_venue', 'book_caterer'],
      }),
      params({ weddingId }),
    );
    expect(added.status).toBe(201);
    const addedBody = (await added.json()).data;
    expect(addedBody.map((t: { title: string; source: string }) => [t.title, t.source])).toEqual([
      ['Book the venue', 'starter'],
      ['Book the caterer', 'starter'],
    ]);

    // Adding the venue again is skipped.
    const again = await addStarter(
      request('POST', `${base(weddingId)}/starter-checklist`, admin.cookie, {
        keys: ['book_venue'],
      }),
      params({ weddingId }),
    );
    expect((await again.json()).data).toEqual([]);
    expect(
      (await starter()).find((i: { key: string }) => i.key === 'book_venue').alreadyAdded,
    ).toBe(true);
  });

  it('imports overlapping starter checklists concurrently without duplicates', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        addStarter(
          request('POST', `${base(weddingId)}/starter-checklist`, admin.cookie, {
            keys: ['book_venue', 'book_caterer'],
          }),
          params({ weddingId }),
        ),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    expect(bodies.reduce((n, b) => n + b.data.length, 0)).toBe(2);
    expect((await list(weddingId, admin.cookie)).body.data).toHaveLength(2);
  });

  it('keeps status and completedAt consistent under concurrent changes', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const task = (await (await add(weddingId, admin.cookie, { title: 'Confirm venue' })).json())
      .data;
    const responses = await Promise.all([
      patch(weddingId, task.id, admin.cookie, { status: 'done' }),
      patch(weddingId, task.id, admin.cookie, { status: 'todo' }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const final = (await list(weddingId, admin.cookie)).body.data[0];
    expect(final.completedAt === null).toBe(final.status !== 'done');
    // Once those requests finish, an explicit last choice must always win.
    expect((await patch(weddingId, task.id, admin.cookie, { status: 'todo' })).status).toBe(200);
    expect((await list(weddingId, admin.cookie)).body.data[0]).toMatchObject({
      status: 'todo',
      completedAt: null,
    });
  });

  it('cannot save a deleted event link during concurrent cleanup', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const event = (
      await (
        await createEvent(
          request('POST', `/api/weddings/${weddingId}/events`, admin.cookie, {
            name: 'Wedding',
            date: `${YEAR}-04-14`,
            startTime: '10:00',
          }),
          params({ weddingId }),
        )
      ).json()
    ).data;
    const responses = await Promise.all([
      add(weddingId, admin.cookie, { title: 'Prepare venue', eventId: event.id }),
      deleteEvent(
        request('DELETE', `/api/weddings/${weddingId}/events/${event.id}`, admin.cookie),
        params({ weddingId, eventId: event.id }),
      ),
    ]);
    expect([201, 400]).toContain(responses[0].status);
    expect(responses[1].status).toBe(204);
    const docs = await getDb()
      .collection('tasks')
      .find({ weddingId: ObjectId.createFromHexString(weddingId) })
      .toArray();
    expect(docs.every((doc) => doc.eventId === null)).toBe(true);
  });

  it('starter due dates never fall before today', async () => {
    const admin = await newUser('Nafiya');
    // A wedding two months away: "10 months before" has already passed.
    const soon = addDays(TODAY, 60);
    const weddingId = await newWedding(admin.cookie, soon);
    const items = (
      await (
        await getStarter(
          request('GET', `${base(weddingId)}/starter-checklist`, admin.cookie),
          params({ weddingId }),
        )
      ).json()
    ).data;
    expect(items.find((i: { key: string }) => i.key === 'book_venue').dueDate).toBe(TODAY);
  });

  it(`stops at ${MAX_TASKS_PER_WEDDING} tasks`, async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const now = new Date();
    await getDb()
      .collection('tasks')
      .insertMany(
        Array.from({ length: MAX_TASKS_PER_WEDDING - 1 }, (_, i) => ({
          weddingId: ObjectId.createFromHexString(weddingId),
          title: `Task ${i}`,
          description: '',
          dueDate: null,
          assigneeUserId: null,
          status: 'todo',
          eventId: null,
          completedAt: null,
          createdByUserId: ObjectId.createFromHexString(admin.userId),
          source: 'manual',
          starterKey: null,
          lastReminderFor: null,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
        })),
      );
    const racing = await Promise.all([
      add(weddingId, admin.cookie, { title: 'Last place A' }),
      add(weddingId, admin.cookie, { title: 'Last place B' }),
    ]);
    expect(racing.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await getDb()
        .collection('tasks')
        .countDocuments({ weddingId: ObjectId.createFromHexString(weddingId) }),
    ).toBe(MAX_TASKS_PER_WEDDING);
    const res = await add(weddingId, admin.cookie, { title: 'One more' });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('TASK_LIMIT_REACHED');
  });

  it('keeps weddings apart, lets Managers plan, and is read-only when archived', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const manager = await newManager(weddingId, admin.cookie);
    const task = (await (await add(weddingId, manager.cookie, { title: 'Book caterer' })).json())
      .data;
    expect(task.createdBy.name).toBe('Ahmed');
    expect((await patch(weddingId, task.id, manager.cookie, { status: 'done' })).status).toBe(200);

    const stranger = await newUser('Meera');
    const otherWeddingId = await newWedding(stranger.cookie);
    expect((await list(weddingId, stranger.cookie)).status).toBe(404);
    expect((await add(weddingId, stranger.cookie, { title: 'X' })).status).toBe(404);
    expect((await patch(weddingId, task.id, stranger.cookie, { title: 'Hacked' })).status).toBe(
      404,
    );
    expect((await remove(weddingId, task.id, stranger.cookie)).status).toBe(404);
    // Their own wedding's URL with this task's id finds nothing.
    expect(
      (await patch(otherWeddingId, task.id, stranger.cookie, { title: 'Hacked' })).status,
    ).toBe(404);
    expect((await remove(otherWeddingId, task.id, stranger.cookie)).status).toBe(404);
    expect((await list(weddingId, admin.cookie)).body.data[0].title).toBe('Book caterer');

    await getDb()
      .collection('weddings')
      .updateOne(
        { _id: ObjectId.createFromHexString(weddingId) },
        { $set: { status: 'archived' } },
      );
    expect((await list(weddingId, admin.cookie)).status).toBe(200);
    const archived = await add(weddingId, admin.cookie, { title: 'X' });
    expect((await archived.json()).error.code).toBe('WEDDING_ARCHIVED');
    expect((await patch(weddingId, task.id, admin.cookie, { title: 'X' })).status).toBe(409);
    expect((await remove(weddingId, task.id, admin.cookie)).status).toBe(409);
  });
});

describe('task priority and last updated (Atlas test database)', () => {
  it('defaults to Medium, filters by priority, and older tasks read as Medium', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const medium = (await (await add(weddingId, admin.cookie, { title: 'Book decor' })).json())
      .data;
    expect(medium.priority).toBe('medium');
    const high = (
      await (await add(weddingId, admin.cookie, { title: 'Book venue', priority: 'high' })).json()
    ).data;
    expect(high.priority).toBe('high');
    expect((await add(weddingId, admin.cookie, { title: 'X', priority: 'urgent' })).status).toBe(
      400,
    );

    // A task saved before priorities existed.
    await getDb()
      .collection('tasks')
      .updateOne({ _id: ObjectId.createFromHexString(medium.id) }, { $unset: { priority: '' } });

    const titles = (body: { data: { title: string }[] }) => body.data.map((t) => t.title);
    expect(titles((await list(weddingId, admin.cookie, '?priority=high')).body)).toEqual([
      'Book venue',
    ]);
    expect(titles((await list(weddingId, admin.cookie, '?priority=medium')).body)).toEqual([
      'Book decor',
    ]);
    expect((await list(weddingId, admin.cookie, '?priority=high,low')).body.data).toHaveLength(1);
    expect((await list(weddingId, admin.cookie, '?priority=urgent')).status).toBe(400);

    const lowered = await patch(weddingId, high.id, admin.cookie, { priority: 'low' });
    expect((await lowered.json()).data.priority).toBe('low');
  });

  it('shows who changed a task last, and cleanups don’t count', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const manager = await newManager(weddingId, admin.cookie);
    const created = (await (await add(weddingId, admin.cookie, { title: 'Book DJ' })).json()).data;
    expect(created.editedBy).toEqual({ userId: admin.userId, name: 'Nafiya' });
    expect(created.editedAt).toBe(created.createdAt);

    const edited = (
      await (await patch(weddingId, created.id, manager.cookie, { status: 'in_progress' })).json()
    ).data;
    expect(edited.editedBy).toEqual({ userId: manager.userId, name: 'Ahmed' });
    expect(Date.parse(edited.editedAt)).toBeGreaterThanOrEqual(Date.parse(created.editedAt));

    // Deleting the linked event is a cleanup: "last updated by" stays with Ahmed.
    const ev = await createEvent(
      request('POST', `/api/weddings/${weddingId}/events`, admin.cookie, {
        name: 'Sangeet',
        date: `${YEAR}-04-13`,
        startTime: '19:00',
      }),
      params({ weddingId }),
    );
    const eventId = (await ev.json()).data.id;
    const linked = (await (await patch(weddingId, created.id, manager.cookie, { eventId })).json())
      .data;
    await deleteEvent(
      request('DELETE', `/api/weddings/${weddingId}/events/${eventId}`, admin.cookie),
      params({ weddingId, eventId }),
    );
    const [after] = (await list(weddingId, admin.cookie)).body.data;
    expect(after).toMatchObject({
      eventId: null,
      editedBy: { name: 'Ahmed' },
      editedAt: linked.editedAt,
    });
  });
});
