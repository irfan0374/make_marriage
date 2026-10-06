import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { GET as me } from '@/app/api/me/route';
import { GET as getWedding, PATCH as patchWedding } from '@/app/api/weddings/[weddingId]/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { collectionSpecs } from '@/modules/collections';
import { todayIn } from '@/shared/dates';

// Two years ahead: always in the future and within the 5-year limit (api-spec §6.1).
const YEAR = Number(todayIn('Asia/Kolkata').slice(0, 4)) + 2;

// Creating a wedding, the membership check and /api/me, against the Atlas test database.

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
      'x-forwarded-for': `192.0.2.${++counter}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

async function newUser(name: string): Promise<string> {
  const res = await signup(
    request('POST', '/api/auth/signup', undefined, {
      name,
      email: `${name.toLowerCase()}.${++counter}@example.com`,
      password: 'correct-horse-42',
    }),
  );
  expect(res.status).toBe(201);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const input = {
  brideName: 'Nafiya',
  groomName: 'Irfan',
  weddingDate: `${YEAR}-04-14`,
  city: 'Kochi',
  sidesEnabled: true,
};

async function userIdOf(cookie: string): Promise<ObjectId> {
  const res = await me(new NextRequest('http://localhost/api/me', { headers: { cookie } }));
  return ObjectId.createFromHexString((await res.json()).data.user.id);
}

/** Member invites aren't built yet, so tests add a Manager directly. */
async function addManager(weddingId: string, cookie: string) {
  const now = new Date();
  await getDb()
    .collection('memberships')
    .insertOne({
      weddingId: ObjectId.createFromHexString(weddingId),
      userId: await userIdOf(cookie),
      role: 'manager',
      sideScope: 'both',
      invitedByUserId: null,
      joinedAt: now,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
}

const create = (cookie: string, body: unknown = input) =>
  createWedding(request('POST', '/api/weddings', cookie, body));
const update = (id: string, cookie: string, body: unknown) =>
  patchWedding(request('PATCH', `/api/weddings/${id}`, cookie, body), {
    params: Promise.resolve({ weddingId: id }),
  });
const read = (id: string, cookie?: string) =>
  getWedding(request('GET', `/api/weddings/${id}`, cookie), {
    params: Promise.resolve({ weddingId: id }),
  });

describe('weddings (Atlas test database)', () => {
  it('saves the chosen venue and timezone', async () => {
    const cookie = await newUser('Venue');
    const res = await create(cookie, {
      ...input,
      brideName: 'Zara',
      venue: 'Grand Hyatt, Bolgatty Island',
      timezone: 'Asia/Dubai',
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({ venue: 'Grand Hyatt, Bolgatty Island', timezone: 'Asia/Dubai' });
    expect((await (await read(data.id, cookie)).json()).data).toMatchObject({
      venue: 'Grand Hyatt, Bolgatty Island',
      timezone: 'Asia/Dubai',
    });
  });

  it('creates a wedding with its defaults and makes the creator its admin', async () => {
    const cookie = await newUser('Irfan');
    const res = await create(cookie);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({
      brideName: 'Nafiya',
      groomName: 'Irfan',
      weddingDate: `${YEAR}-04-14`,
      city: 'Kochi',
      venue: '',
      timezone: 'Asia/Kolkata',
      sidesEnabled: true,
      status: 'active',
      me: { role: 'admin', sideScope: 'both' },
    });
    // Internal settings never leave the server.
    expect(data).not.toHaveProperty('gallery');
    expect(data).not.toHaveProperty('website');

    const _id = ObjectId.createFromHexString(data.id);
    const stored = await getDb().collection('weddings').findOne({ _id });
    expect(stored).toMatchObject({
      website: { slug: `nafiya-irfan-14-apr-${YEAR}`, published: false, indexable: false },
      gallery: { uploadsOpen: true, guestViewing: true, storageCapBytes: 3 * 1024 ** 3 },
      invitation: { autoRemindersEnabled: true },
      schemaVersion: 1,
    });
    expect(stored!.gallery.token).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const memberships = await getDb().collection('memberships').find({ weddingId: _id }).toArray();
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      role: 'admin',
      sideScope: 'both',
      invitedByUserId: null,
    });
  });

  it('gives the next free website address when the suggestion is taken', async () => {
    const body = { ...input, brideName: 'Riya', groomName: 'Arjun' };
    const first = (await (await create(await newUser('Riya'), body)).json()).data;
    const second = (await (await create(await newUser('Riya2'), body)).json()).data;
    const slugs = await getDb()
      .collection('weddings')
      .find({ _id: { $in: [first.id, second.id].map((id) => ObjectId.createFromHexString(id)) } })
      .map((w) => w.website.slug)
      .toArray();
    expect(slugs.sort()).toEqual([`riya-arjun-14-apr-${YEAR}`, `riya-arjun-14-apr-${YEAR}-2`]);
  });

  it('lets members read their wedding and hides it from everyone else (404)', async () => {
    const owner = await newUser('Owner');
    const stranger = await newUser('Stranger');
    const { data } = await (await create(owner)).json();

    expect((await read(data.id, owner)).status).toBe(200);

    const denied = await read(data.id, stranger);
    expect(denied.status).toBe(404);
    expect((await denied.json()).error.code).toBe('NOT_FOUND');

    // A wedding that doesn't exist looks exactly the same.
    expect((await read(new ObjectId().toHexString(), owner)).status).toBe(404);
    expect((await read(data.id)).status).toBe(401);
  });

  it("lists only the user's weddings in /api/me, soonest first, with their role", async () => {
    const cookie = await newUser('Sana');
    const cousin = await newUser('Cousin');
    const stranger = await newUser('Other');
    await create(stranger);

    const getMe = async () =>
      (await me(new NextRequest('http://localhost/api/me', { headers: { cookie } }))).json();
    expect((await getMe()).data.weddings).toEqual([]);

    // Sana's own wedding, and a cousin's wedding where she helps as a Manager.
    await create(cookie, { ...input, brideName: 'Later', weddingDate: `${YEAR}-12-01` });
    const cousins = (
      await (
        await create(cousin, { ...input, brideName: 'Sooner', weddingDate: `${YEAR}-01-01` })
      ).json()
    ).data;
    await addManager(cousins.id, cookie);

    const { data } = await getMe();
    expect(
      data.weddings.map((w: { brideName: string; myRole: string }) => [w.brideName, w.myRole]),
    ).toEqual([
      ['Sooner', 'manager'],
      ['Later', 'admin'],
    ]);
    expect(data.weddings[1]).toMatchObject({ city: 'Kochi', status: 'active' });
  });

  it('lets each person be an admin of one wedding only', async () => {
    const cookie = await newUser('Once');
    expect((await create(cookie)).status).toBe(201);

    const again = await create(cookie, { ...input, brideName: 'Second' });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe('ALREADY_HAS_WEDDING');
    const mine = await getDb()
      .collection('memberships')
      .countDocuments({ userId: await userIdOf(cookie), role: 'admin' });
    expect(mine).toBe(1);
    // Nothing half-created: no wedding without an admin.
    expect(await getDb().collection('weddings').countDocuments({ brideName: 'Second' })).toBe(0);
  });

  it('enforces the rule in the database too, so two quick requests cannot both pass', async () => {
    const cookie = await newUser('Race');
    const [a, b] = await Promise.all([
      create(cookie, { ...input, brideName: 'RaceA' }),
      create(cookie, { ...input, brideName: 'RaceB' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const ids = await getDb()
      .collection('weddings')
      .countDocuments({ brideName: { $in: ['RaceA', 'RaceB'] } });
    expect(ids).toBe(1);
  });

  it("doesn't let a Manager on someone's wedding create one (only the couple creates)", async () => {
    const helper = await newUser('Helper');
    const family = (await (await create(await newUser('Family'))).json()).data;
    await addManager(family.id, helper);
    const res = await create(helper, { ...input, brideName: 'Helper' });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('ALREADY_ON_A_TEAM');
    expect(await getDb().collection('weddings').countDocuments({ brideName: 'Helper' })).toBe(0);
  });

  it('rejects a past date and a logged-out caller', async () => {
    const cookie = await newUser('Past');
    const past = await create(cookie, { ...input, weddingDate: '2020-01-01' });
    expect(past.status).toBe(400);
    expect((await create('mmm_session=nope')).status).toBe(401);
  });
});

describe('editing wedding details (Atlas test database)', () => {
  const weddings = () => getDb().collection('weddings');

  it('lets an admin change details, saving only what changed', async () => {
    const cookie = await newUser('Editor');
    const { data } = await (await create(cookie)).json();
    const _id = ObjectId.createFromHexString(data.id);
    const before = await weddings().findOne({ _id });

    const res = await update(data.id, cookie, {
      brideName: 'Nafiya',
      city: ' Thrissur ',
      venue: 'Lulu Convention Centre',
      timezone: 'Asia/Dubai',
      sidesEnabled: false,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      brideName: 'Nafiya',
      city: 'Thrissur',
      venue: 'Lulu Convention Centre',
      timezone: 'Asia/Dubai',
      sidesEnabled: false,
      me: { role: 'admin' },
    });

    const after = await weddings().findOne({ _id });
    expect(after).toMatchObject({ city: 'Thrissur', timezone: 'Asia/Dubai', sidesEnabled: false });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
    // Shared website links keep working: the address doesn't follow the names or date.
    expect(after!.website.slug).toBe(before!.website.slug);
  });

  it('checks a new date but never a kept one', async () => {
    const cookie = await newUser('Dates');
    const { data } = await (await create(cookie)).json();
    const _id = ObjectId.createFromHexString(data.id);

    const past = await update(data.id, cookie, { weddingDate: '2020-01-01' });
    expect(past.status).toBe(400);
    expect((await past.json()).error.details).toEqual([
      { path: 'weddingDate', message: 'Pick today or a later date' },
    ]);
    expect((await update(data.id, cookie, { weddingDate: `${YEAR + 10}-01-01` })).status).toBe(400);

    // A wedding that has happened can still have a name fixed, with its date sent unchanged.
    await weddings().updateOne({ _id }, { $set: { weddingDate: '2020-01-01' } });
    const fix = await update(data.id, cookie, { weddingDate: '2020-01-01', groomName: 'Irfan K' });
    expect(fix.status).toBe(200);
    expect((await fix.json()).data).toMatchObject({
      weddingDate: '2020-01-01',
      groomName: 'Irfan K',
    });
  });

  it('shows timezones stored in lowercase by early versions in their standard spelling', async () => {
    const cookie = await newUser('Legacy');
    const { data } = await (await create(cookie)).json();
    await weddings().updateOne(
      { _id: ObjectId.createFromHexString(data.id) },
      { $set: { timezone: 'asia/kolkata' } },
    );
    expect((await (await read(data.id, cookie)).json()).data.timezone).toBe('Asia/Kolkata');
  });

  it('refuses Managers (403), non-members (404) and archived weddings (409)', async () => {
    const admin = await newUser('Admin');
    const manager = await newUser('Manager');
    const stranger = await newUser('Stranger');
    const { data } = await (await create(admin)).json();
    const _id = ObjectId.createFromHexString(data.id);

    // Member invites aren't built yet, so add the Manager directly.
    const now = new Date();
    await getDb()
      .collection('memberships')
      .insertOne({
        weddingId: _id,
        userId: await userIdOf(manager),
        role: 'manager',
        sideScope: 'both',
        invitedByUserId: null,
        joinedAt: now,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      });

    const asManager = await update(data.id, manager, { city: 'Thrissur' });
    expect(asManager.status).toBe(403);
    expect((await asManager.json()).error.code).toBe('FORBIDDEN');
    expect((await read(data.id, manager)).status).toBe(200); // Managers can still read it.

    expect((await update(data.id, stranger, { city: 'Thrissur' })).status).toBe(404);

    await weddings().updateOne({ _id }, { $set: { status: 'archived', archivedAt: now } });
    const archived = await update(data.id, admin, { city: 'Thrissur' });
    expect(archived.status).toBe(409);
    expect((await archived.json()).error.code).toBe('WEDDING_ARCHIVED');
    expect((await weddings().findOne({ _id }))!.city).toBe('Kochi');
  });
});
