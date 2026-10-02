import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { GET as me } from '@/app/api/me/route';
import { GET as getWedding } from '@/app/api/weddings/[weddingId]/route';
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

const create = (cookie: string, body: unknown = input) =>
  createWedding(request('POST', '/api/weddings', cookie, body));
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
    const cookie = await newUser('Riya');
    const body = { ...input, brideName: 'Riya', groomName: 'Arjun' };
    const first = (await (await create(cookie, body)).json()).data;
    const second = (await (await create(cookie, body)).json()).data;
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

  it("lists only the user's own weddings in /api/me, soonest first", async () => {
    const cookie = await newUser('Sana');
    const other = await newUser('Other');
    await create(other);

    const getMe = async () =>
      (await me(new NextRequest('http://localhost/api/me', { headers: { cookie } }))).json();
    expect((await getMe()).data.weddings).toEqual([]);

    await create(cookie, { ...input, brideName: 'Later', weddingDate: `${YEAR}-12-01` });
    await create(cookie, { ...input, brideName: 'Sooner', weddingDate: `${YEAR}-01-01` });
    const { data } = await getMe();
    expect(data.weddings.map((w: { brideName: string }) => w.brideName)).toEqual([
      'Sooner',
      'Later',
    ]);
    expect(data.weddings[0]).toMatchObject({ city: 'Kochi', status: 'active', myRole: 'admin' });
  });

  it('rejects a past date and a logged-out caller', async () => {
    const cookie = await newUser('Past');
    const past = await create(cookie, { ...input, weddingDate: '2020-01-01' });
    expect(past.status).toBe(400);
    expect((await create('mmm_session=nope')).status).toBe(401);
  });
});
