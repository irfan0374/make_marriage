import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import {
  DELETE as removeEvent,
  PATCH as patchEvent,
} from '@/app/api/weddings/[weddingId]/events/[eventId]/route';
import { POST as addPresets } from '@/app/api/weddings/[weddingId]/events/presets/route';
import { POST as reorder } from '@/app/api/weddings/[weddingId]/events/reorder/route';
import {
  GET as listEvents,
  POST as createEvent,
} from '@/app/api/weddings/[weddingId]/events/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { MAX_EVENTS_PER_WEDDING } from '@/config/constants';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { collectionSpecs } from '@/modules/collections';
import { todayIn } from '@/shared/dates';

// Events end to end against the Atlas test database (api-spec §8).

const YEAR = Number(todayIn('Asia/Kolkata').slice(0, 4)) + 2;

beforeAll(async () => {
  await applyCollectionSpecs(getDb(), collectionSpecs);
});

let counter = 0;
function request(method: string, path: string, cookie?: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-forwarded-for': `198.51.100.${++counter % 250}`,
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
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, email };
}

async function newWedding(cookie: string): Promise<string> {
  const res = await createWedding(
    request('POST', '/api/weddings', cookie, {
      brideName: 'Nafiya',
      groomName: 'Irfan',
      weddingDate: `${YEAR}-04-14`,
      city: 'Kochi',
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).data.id;
}

/** A Manager on the wedding, through the real invite and join flow. */
async function newManager(weddingId: string, adminCookie: string) {
  const manager = await newUser('Ahmed');
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
  return manager;
}

const base = (weddingId: string) => `/api/weddings/${weddingId}/events`;
const list = (weddingId: string, cookie: string) =>
  listEvents(request('GET', base(weddingId), cookie), params({ weddingId }));
const add = (weddingId: string, cookie: string, body: unknown) =>
  createEvent(request('POST', base(weddingId), cookie, body), params({ weddingId }));
const presets = (weddingId: string, cookie: string, body: unknown) =>
  addPresets(request('POST', `${base(weddingId)}/presets`, cookie, body), params({ weddingId }));
const patch = (weddingId: string, eventId: string, cookie: string, body: unknown) =>
  patchEvent(
    request('PATCH', `${base(weddingId)}/${eventId}`, cookie, body),
    params({ weddingId, eventId }),
  );
const remove = (weddingId: string, eventId: string, cookie: string) =>
  removeEvent(
    request('DELETE', `${base(weddingId)}/${eventId}`, cookie),
    params({ weddingId, eventId }),
  );
const order = (weddingId: string, cookie: string, eventIds: string[]) =>
  reorder(
    request('POST', `${base(weddingId)}/reorder`, cookie, { eventIds }),
    params({ weddingId }),
  );

const mehendi = {
  name: 'Mehendi',
  presetKey: 'mehendi',
  date: `${YEAR}-04-12`,
  startTime: '16:00',
};

describe('events (Atlas test database)', () => {
  it('adds, lists, edits and deletes events', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);

    expect((await (await list(weddingId, admin.cookie)).json()).data).toEqual([]);

    const created = await add(weddingId, admin.cookie, {
      ...mehendi,
      endTime: '21:00',
      venueName: 'Family Courtyard Villa',
      mapUrl: 'https://maps.google.com/?q=Kochi',
    });
    expect(created.status).toBe(201);
    const event = (await created.json()).data;
    expect(event).toMatchObject({
      name: 'Mehendi',
      presetKey: 'mehendi',
      endTime: '21:00',
      venueName: 'Family Courtyard Villa',
      showOnWebsite: true,
      order: 0,
    });

    const edited = await patch(weddingId, event.id, admin.cookie, {
      startTime: '17:00',
      endTime: null,
      dressCode: 'Green & yellow',
    });
    expect(edited.status).toBe(200);
    const body = await edited.json();
    expect(body.data).toMatchObject({
      startTime: '17:00',
      endTime: null,
      dressCode: 'Green & yellow',
    });
    // The time changed, so the app may offer to tell families (api-spec §8.4).
    expect(body.meta).toEqual({ guestFacingChange: true });
    const dressOnly = await patch(weddingId, event.id, admin.cookie, { dressCode: 'Yellow' });
    expect((await dressOnly.json()).meta).toEqual({ guestFacingChange: false });

    expect((await remove(weddingId, event.id, admin.cookie)).status).toBe(204);
    expect((await (await list(weddingId, admin.cookie)).json()).data).toEqual([]);
    expect((await remove(weddingId, event.id, admin.cookie)).status).toBe(404);
  });

  it('checks the end time against the saved start time on an edit', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const event = (await (await add(weddingId, admin.cookie, mehendi)).json()).data;
    const same = await patch(weddingId, event.id, admin.cookie, { endTime: '16:00' });
    expect(same.status).toBe(400);
    expect((await same.json()).error.details).toEqual([
      { path: 'endTime', message: "The end time can't be the same as the start time" },
    ]);
    // Past midnight is fine.
    expect((await patch(weddingId, event.id, admin.cookie, { endTime: '01:00' })).status).toBe(200);
  });

  it('quick-adds presets after the existing events, and reorders them', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const first = (await (await add(weddingId, admin.cookie, mehendi)).json()).data;

    const res = await presets(weddingId, admin.cookie, {
      events: [
        { presetKey: 'sangeet', date: `${YEAR}-04-13`, startTime: '19:00' },
        { presetKey: 'wedding', date: `${YEAR}-04-14`, startTime: '11:00' },
      ],
    });
    expect(res.status).toBe(201);
    const added = (await res.json()).data;
    expect(added.map((e: { name: string; order: number }) => [e.name, e.order])).toEqual([
      ['Sangeet', 1],
      ['Wedding', 2],
    ]);

    const ids = [added[1].id, first.id, added[0].id];
    const reordered = await order(weddingId, admin.cookie, ids);
    expect(reordered.status).toBe(200);
    expect((await reordered.json()).data.map((e: { id: string }) => e.id)).toEqual(ids);
    const listed = (await (await list(weddingId, admin.cookie)).json()).data;
    expect(listed.map((e: { name: string }) => e.name)).toEqual(['Wedding', 'Mehendi', 'Sangeet']);

    // A stale list (missing an event) is a conflict, not a partial reorder.
    const stale = await order(weddingId, admin.cookie, [first.id, added[0].id]);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('CONFLICT');
  });

  it(`stops at ${MAX_EVENTS_PER_WEDDING} events`, async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const now = new Date();
    await getDb()
      .collection('events')
      .insertMany(
        Array.from({ length: MAX_EVENTS_PER_WEDDING - 1 }, (_, i) => ({
          weddingId: ObjectId.createFromHexString(weddingId),
          name: `Event ${i + 1}`,
          presetKey: 'custom',
          date: `${YEAR}-04-12`,
          startTime: '10:00',
          endTime: null,
          venueName: '',
          address: '',
          mapUrl: null,
          dressCode: '',
          notes: '',
          showOnWebsite: true,
          order: i,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
        })),
      );
    const two = await presets(weddingId, admin.cookie, {
      events: [
        { presetKey: 'haldi', date: `${YEAR}-04-13`, startTime: '09:30' },
        { presetKey: 'reception', date: `${YEAR}-04-14`, startTime: '19:00' },
      ],
    });
    expect(two.status).toBe(409);
    expect((await two.json()).error.code).toBe('EVENT_LIMIT_REACHED');
    expect((await add(weddingId, admin.cookie, mehendi)).status).toBe(201);
    expect((await add(weddingId, admin.cookie, mehendi)).status).toBe(409);

    // Several adds at the same moment, with room for one: the limit still holds.
    const events = getDb().collection('events');
    const wedding = ObjectId.createFromHexString(weddingId);
    await events.deleteOne({ weddingId: wedding, name: 'Event 1' });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => add(weddingId, admin.cookie, mehendi)),
    );
    expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    expect(results.filter((r) => r.status === 201).length).toBeLessThanOrEqual(1);
    expect(await events.countDocuments({ weddingId: wedding })).toBeLessThanOrEqual(
      MAX_EVENTS_PER_WEDDING,
    );
  });

  it('lets Managers plan events too', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const manager = await newManager(weddingId, admin.cookie);
    const res = await add(weddingId, manager.cookie, mehendi);
    expect(res.status).toBe(201);
    const event = (await res.json()).data;
    expect(
      (await patch(weddingId, event.id, manager.cookie, { notes: 'Henna from 4:30' })).status,
    ).toBe(200);
    expect((await remove(weddingId, event.id, manager.cookie)).status).toBe(204);
  });

  it('keeps weddings apart: other weddings get 404 and archived ones are read-only', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const event = (await (await add(weddingId, admin.cookie, mehendi)).json()).data;

    const stranger = await newUser('Meera');
    const otherWeddingId = await newWedding(stranger.cookie);
    expect((await list(weddingId, stranger.cookie)).status).toBe(404);
    expect((await add(weddingId, stranger.cookie, mehendi)).status).toBe(404);
    expect((await patch(weddingId, event.id, stranger.cookie, { name: 'Hacked' })).status).toBe(
      404,
    );
    expect((await remove(weddingId, event.id, stranger.cookie)).status).toBe(404);
    // Their own wedding's URL with this wedding's event id finds nothing either.
    expect(
      (await patch(otherWeddingId, event.id, stranger.cookie, { name: 'Hacked' })).status,
    ).toBe(404);
    expect((await remove(otherWeddingId, event.id, stranger.cookie)).status).toBe(404);
    expect((await order(otherWeddingId, stranger.cookie, [event.id])).status).toBe(409);
    expect((await (await list(weddingId, admin.cookie)).json()).data[0].name).toBe('Mehendi');

    expect((await list(weddingId, '')).status).toBe(401);

    await getDb()
      .collection('weddings')
      .updateOne(
        { _id: ObjectId.createFromHexString(weddingId) },
        { $set: { status: 'archived' } },
      );
    expect((await list(weddingId, admin.cookie)).status).toBe(200);
    const archived = await add(weddingId, admin.cookie, mehendi);
    expect((await archived.json()).error.code).toBe('WEDDING_ARCHIVED');
    expect((await patch(weddingId, event.id, admin.cookie, { name: 'X' })).status).toBe(409);
    expect((await remove(weddingId, event.id, admin.cookie)).status).toBe(409);
  });
});
