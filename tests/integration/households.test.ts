import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import { DELETE as deleteEvent } from '@/app/api/weddings/[weddingId]/events/[eventId]/route';
import { POST as createEvent } from '@/app/api/weddings/[weddingId]/events/route';
import {
  DELETE as removeHousehold,
  GET as getHousehold,
  PATCH as patchHousehold,
} from '@/app/api/weddings/[weddingId]/households/[householdId]/route';
import { POST as bulk } from '@/app/api/weddings/[weddingId]/households/bulk/route';
import { GET as duplicates } from '@/app/api/weddings/[weddingId]/households/duplicates/route';
import {
  GET as listHouseholds,
  POST as createHousehold,
} from '@/app/api/weddings/[weddingId]/households/route';
import { GET as summary } from '@/app/api/weddings/[weddingId]/households/summary/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { GET as getWedding } from '@/app/api/weddings/[weddingId]/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { collectionSpecs } from '@/modules/collections';
import { todayIn } from '@/shared/dates';

// Guest families end to end against the Atlas test database (api-spec §9), with side scoping.

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
      'x-forwarded-for': `203.0.113.${++counter % 250}`,
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
  const body = await res.json();
  return {
    cookie: res.headers.get('set-cookie')!.split(';')[0]!,
    email,
    userId: body.data.user.id,
  };
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

async function newManager(weddingId: string, adminCookie: string, sideScope: string) {
  const manager = await newUser('Ahmed');
  const res = await createInvite(
    request('POST', `/api/weddings/${weddingId}/members/invites`, adminCookie, {
      email: manager.email,
      role: 'manager',
      sideScope,
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

async function newEvent(weddingId: string, cookie: string, name: string) {
  const res = await createEvent(
    request('POST', `/api/weddings/${weddingId}/events`, cookie, {
      name,
      date: `${YEAR}-04-12`,
      startTime: '17:00',
    }),
    params({ weddingId }),
  );
  return (await res.json()).data.id as string;
}

const base = (weddingId: string) => `/api/weddings/${weddingId}/households`;
const add = (weddingId: string, cookie: string, body: unknown) =>
  createHousehold(request('POST', base(weddingId), cookie, body), params({ weddingId }));
const list = async (weddingId: string, cookie: string, query = '') => {
  const res = await listHouseholds(
    request('GET', `${base(weddingId)}${query}`, cookie),
    params({ weddingId }),
  );
  return { status: res.status, body: await res.json() };
};
const patch = (weddingId: string, householdId: string, cookie: string, body: unknown) =>
  patchHousehold(
    request('PATCH', `${base(weddingId)}/${householdId}`, cookie, body),
    params({ weddingId, householdId }),
  );
const get = (weddingId: string, householdId: string, cookie: string) =>
  getHousehold(
    request('GET', `${base(weddingId)}/${householdId}`, cookie),
    params({ weddingId, householdId }),
  );
const remove = (weddingId: string, householdId: string, cookie: string) =>
  removeHousehold(
    request('DELETE', `${base(weddingId)}/${householdId}`, cookie),
    params({ weddingId, householdId }),
  );
const totals = async (weddingId: string, cookie: string) =>
  (
    await (
      await summary(request('GET', `${base(weddingId)}/summary`, cookie), params({ weddingId }))
    ).json()
  ).data;
const names = (body: { data: { displayName: string }[] }) => body.data.map((h) => h.displayName);

const sharma = {
  displayName: 'Sharma family',
  members: [{ name: 'Rajesh Sharma' }, { name: 'Sunita Sharma' }, { name: ' ' }],
  email: ' Rajesh@Example.com ',
  phone: '98765 43210',
  side: 'bride',
  tags: ['VIP', 'Family'],
};

describe('guest families (Atlas test database)', () => {
  it('adds, reads, edits and deletes a family', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const mehendi = await newEvent(weddingId, admin.cookie, 'Mehendi');

    const res = await add(weddingId, admin.cookie, {
      ...sharma,
      invitedEvents: [{ eventId: mehendi }],
    });
    expect(res.status).toBe(201);
    const family = (await res.json()).data;
    expect(family).toMatchObject({
      displayName: 'Sharma family',
      // Blank member rows are dropped; headcount defaults to the members.
      members: [{ name: 'Rajesh Sharma' }, { name: 'Sunita Sharma' }],
      headcount: 2,
      email: 'rajesh@example.com',
      phone: '+919876543210',
      side: 'bride',
      tags: ['VIP', 'Family'],
      invitedEvents: [{ eventId: mehendi, headcount: 2 }],
      inviteStatus: 'not_sent',
      responseStatus: 'none',
      createdBy: { name: 'Nafiya' },
    });
    // The personal link token is stored, never returned in the list.
    expect(family.token).toBeUndefined();

    // New tags were added to the wedding's tag list.
    const wedding = await (
      await getWedding(
        request('GET', `/api/weddings/${weddingId}`, admin.cookie),
        params({ weddingId }),
      )
    ).json();
    expect(wedding.data.guestTags).toEqual(expect.arrayContaining(['VIP', 'Family']));

    const edited = await patch(weddingId, family.id, admin.cookie, {
      headcount: 4,
      tags: ['vip', 'Out of town'],
      notes: 'Vegetarian',
    });
    expect(edited.status).toBe(200);
    // "vip" reuses the existing "VIP" spelling.
    expect((await edited.json()).data).toMatchObject({
      headcount: 4,
      tags: ['VIP', 'Out of town'],
    });

    expect((await get(weddingId, family.id, admin.cookie)).status).toBe(200);
    expect((await remove(weddingId, family.id, admin.cookie)).status).toBe(204);
    expect((await get(weddingId, family.id, admin.cookie)).status).toBe(404);
  });

  it('checks events, headcounts and sides', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const other = await newUser('Meera');
    const otherWedding = await newWedding(other.cookie);
    const foreignEvent = await newEvent(otherWedding, other.cookie, 'Haldi');
    const mehendi = await newEvent(weddingId, admin.cookie, 'Mehendi');

    const noSide = await add(weddingId, admin.cookie, { displayName: 'Iyer family' });
    expect((await noSide.json()).error.details).toEqual([
      { path: 'side', message: 'Choose the bride side or the groom side' },
    ]);
    const foreign = await add(weddingId, admin.cookie, {
      displayName: 'Iyer family',
      side: 'groom',
      invitedEvents: [{ eventId: foreignEvent }],
    });
    expect(foreign.status).toBe(400);
    const tooMany = await add(weddingId, admin.cookie, {
      displayName: 'Iyer family',
      side: 'groom',
      headcount: 2,
      invitedEvents: [{ eventId: mehendi, headcount: 3 }],
    });
    expect(tooMany.status).toBe(400);
    expect(
      (await add(weddingId, admin.cookie, { displayName: 'X', side: 'groom', phone: '12' })).status,
    ).toBe(400);

    // Sides off: the side is ignored.
    const flat = await newUser('Zara');
    const flatWedding = await newWedding(flat.cookie, false);
    const res = await add(flatWedding, flat.cookie, { displayName: 'Khan family', side: 'bride' });
    expect((await res.json()).data.side).toBeNull();
  });

  it('searches, filters, sorts and pages', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const sangeet = await newEvent(weddingId, admin.cookie, 'Sangeet');
    await add(weddingId, admin.cookie, { ...sharma, invitedEvents: [{ eventId: sangeet }] });
    await add(weddingId, admin.cookie, {
      displayName: 'verma family',
      members: [{ name: 'Vikram Verma' }],
      side: 'groom',
      tags: ['Colleagues'],
    });
    await add(weddingId, admin.cookie, {
      displayName: 'Aggarwal family',
      side: 'groom',
      headcount: 5,
    });

    // Name order ignores case.
    expect(names((await list(weddingId, admin.cookie)).body)).toEqual([
      'Aggarwal family',
      'Sharma family',
      'verma family',
    ]);
    expect(names((await list(weddingId, admin.cookie, '?q=vikram')).body)).toEqual([
      'verma family',
    ]);
    expect(names((await list(weddingId, admin.cookie, '?q=98765')).body)).toEqual([
      'Sharma family',
    ]);
    expect(names((await list(weddingId, admin.cookie, '?side=groom')).body)).toHaveLength(2);
    expect(names((await list(weddingId, admin.cookie, '?tags=colleagues')).body)).toEqual([
      'verma family',
    ]);
    expect(names((await list(weddingId, admin.cookie, `?eventId=${sangeet}`)).body)).toEqual([
      'Sharma family',
    ]);
    // Regex characters in a search are plain text.
    expect((await list(weddingId, admin.cookie, '?q=(')).body.data).toEqual([]);

    const page = await list(weddingId, admin.cookie, '?limit=2');
    expect(page.body.meta).toEqual({ nextCursor: '2', total: 3 });
    expect(names((await list(weddingId, admin.cookie, '?limit=2&cursor=2')).body)).toEqual([
      'verma family',
    ]);

    expect(await totals(weddingId, admin.cookie)).toEqual({
      households: 3,
      people: 3 + 1 + 5 - 1,
      events: [{ eventId: sangeet, households: 1, people: 2 }],
      sideScope: null,
    });
  });

  it('limits a side-scoped Manager to their side everywhere', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const manager = await newManager(weddingId, admin.cookie, 'groom');
    const bride = (await (await add(weddingId, admin.cookie, sharma)).json()).data;
    const groom = (
      await (
        await add(weddingId, admin.cookie, { displayName: 'Verma family', side: 'groom' })
      ).json()
    ).data;

    expect(names((await list(weddingId, manager.cookie)).body)).toEqual(['Verma family']);
    // Asking for the other side doesn't widen it.
    expect((await list(weddingId, manager.cookie, '?side=bride')).body.data).toEqual([]);
    expect((await list(weddingId, manager.cookie, '?q=sharma')).body.data).toEqual([]);
    expect((await totals(weddingId, manager.cookie)).households).toBe(1);
    expect((await totals(weddingId, manager.cookie)).sideScope).toBe('groom');

    expect((await get(weddingId, bride.id, manager.cookie)).status).toBe(404);
    expect((await patch(weddingId, bride.id, manager.cookie, { notes: 'x' })).status).toBe(404);
    expect((await remove(weddingId, bride.id, manager.cookie)).status).toBe(404);

    // They add families to their own side only.
    const own = await add(weddingId, manager.cookie, { displayName: 'Kapoor family' });
    expect((await own.json()).data.side).toBe('groom');
    const wrong = await add(weddingId, manager.cookie, {
      displayName: 'Nair family',
      side: 'bride',
    });
    expect(wrong.status).toBe(400);

    // Duplicates and bulk actions never reach the other side.
    const dupes = await duplicates(
      request('GET', `${base(weddingId)}/duplicates?displayName=Sharma%20family`, manager.cookie),
      params({ weddingId }),
    );
    expect((await dupes.json()).data).toEqual([]);
    const bulkDelete = await bulk(
      request('POST', `${base(weddingId)}/bulk`, manager.cookie, {
        action: 'delete',
        householdIds: [bride.id, groom.id],
      }),
      params({ weddingId }),
    );
    expect((await bulkDelete.json()).data).toEqual({ updated: 1 });
    expect(names((await list(weddingId, admin.cookie)).body)).toEqual([
      'Kapoor family',
      'Sharma family',
    ]);
  });

  it('warns about possible duplicates', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const family = (await (await add(weddingId, admin.cookie, sharma)).json()).data;
    const check = async (query: string) =>
      (
        await (
          await duplicates(
            request('GET', `${base(weddingId)}/duplicates?${query}`, admin.cookie),
            params({ weddingId }),
          )
        ).json()
      ).data;
    expect(await check('phone=%2B91%2098765%2043210')).toEqual([
      { id: family.id, displayName: 'Sharma family', side: 'bride', reason: 'phone' },
    ]);
    expect((await check('displayName=SHARMA%20FAMILY'))[0].reason).toBe('name');
    expect(await check(`displayName=Sharma%20family&excludeId=${family.id}`)).toEqual([]);
  });

  it('bulk invites, tags and removes events', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const wedding = await newEvent(weddingId, admin.cookie, 'Wedding');
    const a = (await (await add(weddingId, admin.cookie, sharma)).json()).data;
    const b = (
      await (
        await add(weddingId, admin.cookie, {
          displayName: 'Verma family',
          side: 'groom',
          headcount: 3,
        })
      ).json()
    ).data;
    const run = async (body: object) =>
      (
        await (
          await bulk(
            request('POST', `${base(weddingId)}/bulk`, admin.cookie, body),
            params({ weddingId }),
          )
        ).json()
      ).data;

    expect(
      await run({ action: 'assign_events', householdIds: [a.id, b.id], eventIds: [wedding] }),
    ).toEqual({ updated: 2 });
    // Already invited: nothing to change.
    expect(
      await run({ action: 'assign_events', householdIds: [a.id], eventIds: [wedding] }),
    ).toEqual({ updated: 0 });
    expect((await totals(weddingId, admin.cookie)).events).toEqual([
      { eventId: wedding, households: 2, people: 5 },
    ]);
    expect(await run({ action: 'add_tags', householdIds: [b.id], tags: ['Out of town'] })).toEqual({
      updated: 1,
    });
    expect(await run({ action: 'remove_tags', householdIds: [a.id, b.id], tags: ['vip'] })).toEqual(
      { updated: 1 },
    );
    expect(
      await run({ action: 'remove_events', householdIds: [a.id], eventIds: [wedding] }),
    ).toEqual({ updated: 1 });
    const after = (await list(weddingId, admin.cookie)).body.data;
    expect(
      after.map((h: { tags: string[]; invitedEvents: unknown[] }) => [
        h.tags,
        h.invitedEvents.length,
      ]),
    ).toEqual([
      [['Family'], 0],
      [['Out of town'], 1],
    ]);
  });

  it('deleting an event asks first, then takes it off every family', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const haldi = await newEvent(weddingId, admin.cookie, 'Haldi');
    const family = (
      await (
        await add(weddingId, admin.cookie, { ...sharma, invitedEvents: [{ eventId: haldi }] })
      ).json()
    ).data;
    // A reply on record, as Invitations will store it.
    await getDb()
      .collection('households')
      .updateOne(
        { _id: ObjectId.createFromHexString(family.id) },
        {
          $set: {
            rsvps: [
              {
                eventId: ObjectId.createFromHexString(haldi),
                status: 'attending',
                attendingCount: 2,
                recordedBy: 'guest',
                respondedAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            responseStatus: 'complete',
          },
        },
      );

    const del = (confirm: boolean) =>
      deleteEvent(
        request(
          'DELETE',
          `/api/weddings/${weddingId}/events/${haldi}${confirm ? '?confirm=true' : ''}`,
          admin.cookie,
        ),
        params({ weddingId, eventId: haldi }),
      );
    const first = await del(false);
    expect(first.status).toBe(409);
    expect((await first.json()).error).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      details: { affectedHouseholds: 1 },
    });
    expect((await del(true)).status).toBe(204);

    const after = (await (await get(weddingId, family.id, admin.cookie)).json()).data;
    expect(after).toMatchObject({ invitedEvents: [], rsvps: [], responseStatus: 'none' });
    const stored = await getDb()
      .collection('households')
      .findOne({ _id: ObjectId.createFromHexString(family.id) });
    expect(stored?.archivedRsvps).toEqual([
      expect.objectContaining({
        eventNameSnapshot: 'Haldi',
        status: 'attending',
        attendingCount: 2,
      }),
    ]);
  });

  it('keeps weddings apart and is read-only when archived', async () => {
    const admin = await newUser('Nafiya');
    const weddingId = await newWedding(admin.cookie);
    const family = (await (await add(weddingId, admin.cookie, sharma)).json()).data;
    const stranger = await newUser('Meera');
    const otherWeddingId = await newWedding(stranger.cookie);

    expect((await list(weddingId, stranger.cookie)).status).toBe(404);
    expect((await get(weddingId, family.id, stranger.cookie)).status).toBe(404);
    expect((await get(otherWeddingId, family.id, stranger.cookie)).status).toBe(404);
    expect((await patch(otherWeddingId, family.id, stranger.cookie, { notes: 'x' })).status).toBe(
      404,
    );
    expect((await remove(otherWeddingId, family.id, stranger.cookie)).status).toBe(404);
    const crossBulk = await bulk(
      request('POST', `${base(otherWeddingId)}/bulk`, stranger.cookie, {
        action: 'delete',
        householdIds: [family.id],
      }),
      params({ weddingId: otherWeddingId }),
    );
    expect((await crossBulk.json()).data).toEqual({ updated: 0 });
    expect((await get(weddingId, family.id, admin.cookie)).status).toBe(200);

    await getDb()
      .collection('weddings')
      .updateOne(
        { _id: ObjectId.createFromHexString(weddingId) },
        { $set: { status: 'archived' } },
      );
    expect((await list(weddingId, admin.cookie)).status).toBe(200);
    expect((await add(weddingId, admin.cookie, sharma)).status).toBe(409);
    expect((await patch(weddingId, family.id, admin.cookie, { notes: 'x' })).status).toBe(409);
  });
});
