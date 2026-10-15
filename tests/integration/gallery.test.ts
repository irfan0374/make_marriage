import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import { GET as publicPhotos } from '@/app/api/public/gallery/[token]/photos/route';
import { GET as publicGallery } from '@/app/api/public/gallery/[token]/route';
import { POST as complete } from '@/app/api/public/gallery/[token]/uploads/complete/route';
import { POST as uploads } from '@/app/api/public/gallery/[token]/uploads/route';
import { DELETE as deleteEvent } from '@/app/api/weddings/[weddingId]/events/[eventId]/route';
import { POST as createEvent } from '@/app/api/weddings/[weddingId]/events/route';
import { POST as downloadUrls } from '@/app/api/weddings/[weddingId]/gallery/download-urls/route';
import { POST as bulk } from '@/app/api/weddings/[weddingId]/gallery/photos/bulk/route';
import { POST as teamComplete } from '@/app/api/weddings/[weddingId]/gallery/uploads/complete/route';
import { POST as teamUploads } from '@/app/api/weddings/[weddingId]/gallery/uploads/route';
import {
  DELETE as deletePhoto,
  PATCH as patchPhoto,
} from '@/app/api/weddings/[weddingId]/gallery/photos/[photoId]/route';
import { GET as listPhotos } from '@/app/api/weddings/[weddingId]/gallery/photos/route';
import { GET as qr } from '@/app/api/weddings/[weddingId]/gallery/qr/route';
import { POST as regenerate } from '@/app/api/weddings/[weddingId]/gallery/regenerate-link/route';
import {
  GET as getGallery,
  PATCH as patchGallery,
} from '@/app/api/weddings/[weddingId]/gallery/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { testObjects } from '@/lib/r2';
import { collectionSpecs } from '@/modules/collections';
import { cleanupPendingPhotos } from '@/modules/gallery';
import { todayIn } from '@/shared/dates';

// The private photo gallery (api-spec §19, PRD §5.10) against the Atlas test database.

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
      'x-forwarded-for': `100.64.2.${++counter % 250}`,
      'user-agent': 'vitest',
      ...(cookie ? { cookie } : {}),
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function newUser(name: string) {
  const email = `${name.toLowerCase()}.gal.${++counter}.${Date.now()}@example.com`;
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
    }),
    params({ weddingId }),
  );
  const mehendi = (await event.json()).data.id as string;
  const overview = (await (await gallery(weddingId, admin.cookie)).json()).data;
  const token = (overview.url as string).split('/gallery/')[1]!;
  return { admin, weddingId, mehendi, token };
}

const base = (weddingId: string) => `/api/weddings/${weddingId}/gallery`;
const gallery = (weddingId: string, cookie: string) =>
  getGallery(request('GET', base(weddingId), cookie), params({ weddingId }));
const pub = (token: string) => `/api/public/gallery/${token}`;

/** A real WebP's first bytes, for the upload content check. */
const webp = (sizeBytes: number) => ({
  sizeBytes,
  contentType: 'image/webp',
  firstBytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
});
const file = (clientId: string) => ({
  clientId,
  width: 2000,
  height: 1500,
  displayBytes: 500_000,
  thumbBytes: 40_000,
});
const keys = (weddingId: string, photoId: string) => ({
  display: `weddings/${weddingId}/gallery/${photoId}/display.webp`,
  thumb: `weddings/${weddingId}/gallery/${photoId}/thumb.webp`,
});

/** Ask for upload links, "upload" the files, confirm them; returns the photo ids. */
async function guestUpload(
  token: string,
  weddingId: string,
  count: number,
  extra: Record<string, unknown> = {},
) {
  const res = await uploads(
    request('POST', `${pub(token)}/uploads`, undefined, {
      files: Array.from({ length: count }, (_, i) => file(`f${i}`)),
      ...extra,
    }),
    params({ token }),
  );
  expect(res.status).toBe(200);
  const ids = ((await res.json()).data.uploads as { photoId: string }[]).map((u) => u.photoId);
  for (const id of ids) {
    const k = keys(weddingId, id);
    testObjects().set(k.display, webp(500_000));
    testObjects().set(k.thumb, webp(40_000));
  }
  const done = await complete(
    request('POST', `${pub(token)}/uploads/complete`, undefined, { photoIds: ids }),
    params({ token }),
  );
  expect((await done.json()).data.ready).toEqual(ids);
  return ids;
}

async function addManager(weddingId: string, adminCookie: string) {
  const manager = await newUser('Ahmed');
  const invite = await createInvite(
    request('POST', `/api/weddings/${weddingId}/members/invites`, adminCookie, {
      email: manager.email,
      role: 'manager',
      sideScope: 'both',
    }),
    params({ weddingId }),
  );
  const token = (await invite.json()).data.inviteLink.split('/join/')[1]!;
  await accept(
    request('POST', `/api/member-invites/${token}/accept`, manager.cookie),
    params({ token }),
  );
  return manager;
}

describe('photo gallery (Atlas test database)', () => {
  it('lets guests upload photos that count against storage, then browse them', async () => {
    const { admin, weddingId, mehendi, token } = await setup();
    const info = (await (await publicGallery(request('GET', pub(token)), params({ token }))).json())
      .data;
    expect(info).toMatchObject({
      weddingName: 'Nafiya & Irfan',
      uploadsOpen: true,
      guestViewing: true,
      photoCount: 0,
      albums: [
        { albumEventId: null, name: 'General', count: 0 },
        { albumEventId: mehendi, name: 'Mehendi', count: 0 },
      ],
    });

    // Asking for links reserves storage; nothing is used until confirmed.
    const ticket = await uploads(
      request('POST', `${pub(token)}/uploads`, undefined, {
        albumEventId: mehendi,
        uploaderName: '  Sana ',
        files: [file('a'), file('b')],
      }),
      params({ token }),
    );
    const { uploads: links } = (await ticket.json()).data;
    expect(links).toHaveLength(2);
    expect(links[0].display.headers).toEqual({
      'Content-Type': 'image/webp',
      'Content-Length': '500000',
    });
    let storage = (await (await gallery(weddingId, admin.cookie)).json()).data.storage;
    expect(storage).toMatchObject({ usedBytes: 0, reservedBytes: 1_080_000 });

    // Not uploaded yet: missing. Then uploaded: ready, and reserved becomes used.
    const ids = links.map((u: { photoId: string }) => u.photoId);
    const first = await complete(
      request('POST', `${pub(token)}/uploads/complete`, undefined, { photoIds: ids }),
      params({ token }),
    );
    expect((await first.json()).data).toMatchObject({ ready: [], missing: ids });
    for (const id of ids) {
      testObjects().set(keys(weddingId, id).display, webp(480_000));
      testObjects().set(keys(weddingId, id).thumb, webp(30_000));
    }
    const second = await complete(
      request('POST', `${pub(token)}/uploads/complete`, undefined, { photoIds: ids }),
      params({ token }),
    );
    expect((await second.json()).data.ready).toEqual(ids);
    // Confirming again changes nothing.
    await complete(
      request('POST', `${pub(token)}/uploads/complete`, undefined, { photoIds: ids }),
      params({ token }),
    );
    storage = (await (await gallery(weddingId, admin.cookie)).json()).data.storage;
    expect(storage).toMatchObject({ usedBytes: 1_020_000, reservedBytes: 0 });

    const browse = await publicPhotos(
      request('GET', `${pub(token)}/photos?album=${mehendi}`),
      params({ token }),
    );
    const photos = (await browse.json()).data;
    expect(photos).toHaveLength(2);
    expect(photos[0]).toMatchObject({ albumName: 'Mehendi', uploaderName: 'Sana', width: 2000 });
    expect(photos[0]).not.toHaveProperty('hidden');
    expect(photos[0].downloadUrl).toContain('response-content-disposition');

    // A file that isn't really an image is refused and removed, freeing its storage.
    const bad = await uploads(
      request('POST', `${pub(token)}/uploads`, undefined, { files: [file('x')] }),
      params({ token }),
    );
    const badId = (await bad.json()).data.uploads[0].photoId;
    testObjects().set(keys(weddingId, badId).display, {
      sizeBytes: 500_000,
      contentType: 'image/webp',
      firstBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0]),
    });
    testObjects().set(keys(weddingId, badId).thumb, webp(40_000));
    const rejected = await complete(
      request('POST', `${pub(token)}/uploads/complete`, undefined, { photoIds: [badId] }),
      params({ token }),
    );
    expect((await rejected.json()).data.rejected).toEqual([badId]);
    expect(testObjects().has(keys(weddingId, badId).display)).toBe(false);
    storage = (await (await gallery(weddingId, admin.cookie)).json()).data.storage;
    expect(storage.reservedBytes).toBe(0);

    // Limits: too large, too many at once, a wrong album.
    const big = await uploads(
      request('POST', `${pub(token)}/uploads`, undefined, {
        files: [{ ...file('big'), displayBytes: 3_000_000 }],
      }),
      params({ token }),
    );
    expect((await big.json()).error.code).toBe('FILE_TOO_LARGE');
    const many = await uploads(
      request('POST', `${pub(token)}/uploads`, undefined, {
        files: Array.from({ length: 51 }, (_, i) => file(`m${i}`)),
      }),
      params({ token }),
    );
    expect(many.status).toBe(400);
    const wrongAlbum = await uploads(
      request('POST', `${pub(token)}/uploads`, undefined, {
        albumEventId: new ObjectId().toHexString(),
        files: [file('w')],
      }),
      params({ token }),
    );
    expect((await wrongAlbum.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('respects the storage cap, closed uploads, viewing off and a new link', async () => {
    const { admin, weddingId, token } = await setup();
    await getDb()
      .collection('weddings')
      .updateOne(
        { _id: new ObjectId(weddingId) },
        { $set: { 'gallery.storageCapBytes': 600_000 } },
      );
    const full = await uploads(
      request('POST', `${pub(token)}/uploads`, undefined, { files: [file('a'), file('b')] }),
      params({ token }),
    );
    expect((await full.json()).error.code).toBe('STORAGE_LIMIT_REACHED');
    await getDb()
      .collection('weddings')
      .updateOne(
        { _id: new ObjectId(weddingId) },
        { $set: { 'gallery.storageCapBytes': 3221225472 } },
      );

    const patch = (cookie: string, body: unknown) =>
      patchGallery(request('PATCH', base(weddingId), cookie, body), params({ weddingId }));
    const manager = await addManager(weddingId, admin.cookie);
    expect((await patch(manager.cookie, { uploadsOpen: false })).status).toBe(403);
    expect((await (await patch(admin.cookie, { uploadsOpen: false })).json()).data).toMatchObject({
      uploadsOpen: false,
      guestViewing: true,
    });
    const closed = await uploads(
      request('POST', `${pub(token)}/uploads`, undefined, { files: [file('a')] }),
      params({ token }),
    );
    expect((await closed.json()).error.code).toBe('UPLOADS_CLOSED');

    await patch(admin.cookie, { guestViewing: false });
    const off = await publicPhotos(request('GET', `${pub(token)}/photos`), params({ token }));
    expect((await off.json()).error.code).toBe('GALLERY_VIEWING_OFF');

    // QR codes for the current link.
    const png = await qr(
      request('GET', `${base(weddingId)}/qr?format=png`, manager.cookie),
      params({ weddingId }),
    );
    expect(png.headers.get('content-type')).toBe('image/png');
    const svg = await qr(
      request('GET', `${base(weddingId)}/qr?format=svg`, manager.cookie),
      params({ weddingId }),
    );
    expect(await svg.text()).toContain('<svg');

    // A new link: Admins only; the old one stops working at once.
    const mgrRegen = await regenerate(
      request('POST', `${base(weddingId)}/regenerate-link`, manager.cookie),
      params({ weddingId }),
    );
    expect(mgrRegen.status).toBe(403);
    const fresh = await regenerate(
      request('POST', `${base(weddingId)}/regenerate-link`, admin.cookie),
      params({ weddingId }),
    );
    const newToken = (await fresh.json()).data.url.split('/gallery/')[1];
    expect(newToken).not.toBe(token);
    const old = await publicGallery(request('GET', pub(token)), params({ token }));
    expect((await old.json()).error.code).toBe('LINK_INVALID');
    const now = await publicGallery(request('GET', pub(newToken)), params({ token: newToken }));
    expect(now.status).toBe(200);
  });

  it('lets the team hide, move and delete photos, and frees storage', async () => {
    const { admin, weddingId, mehendi, token } = await setup();
    const ids = await guestUpload(token, weddingId, 4);
    const manager = await addManager(weddingId, admin.cookie);
    const list = async (query = '') =>
      (
        await (
          await listPhotos(
            request('GET', `${base(weddingId)}/photos${query}`, manager.cookie),
            params({ weddingId }),
          )
        ).json()
      ).data as { id: string; hidden: boolean; albumName: string }[];

    // One photo hidden: the team still sees it, guests don't.
    const hidden = await patchPhoto(
      request('PATCH', `${base(weddingId)}/photos/${ids[0]}`, manager.cookie, { hidden: true }),
      params({ weddingId, photoId: ids[0]! }),
    );
    expect((await hidden.json()).data.hidden).toBe(true);
    expect((await list('?hidden=true')).map((p) => p.id)).toEqual([ids[0]]);
    const guests = await publicPhotos(request('GET', `${pub(token)}/photos`), params({ token }));
    expect((await guests.json()).data.map((p: { id: string }) => p.id)).not.toContain(ids[0]);

    // Moving to an album, in bulk.
    const moved = await bulk(
      request('POST', `${base(weddingId)}/photos/bulk`, manager.cookie, {
        action: 'move',
        photoIds: [ids[1], ids[2]],
        albumEventId: mehendi,
      }),
      params({ weddingId }),
    );
    expect((await moved.json()).data.updated).toBe(2);
    expect((await list(`?album=${mehendi}`)).length).toBe(2);
    const counts = (await (await gallery(weddingId, admin.cookie)).json()).data.counts;
    expect(counts).toMatchObject({ total: 4, hidden: 1 });
    expect(counts.byAlbum).toEqual([
      { albumEventId: null, name: 'General', count: 2 },
      { albumEventId: mehendi, name: 'Mehendi', count: 2 },
    ]);

    // Deleting the event moves its photos to General.
    await deleteEvent(
      request('DELETE', `/api/weddings/${weddingId}/events/${mehendi}`, admin.cookie),
      params({ weddingId, eventId: mehendi }),
    );
    expect((await list('?album=general')).length).toBe(4);

    // Delete one and two more in bulk: files removed, storage freed.
    const one = await deletePhoto(
      request('DELETE', `${base(weddingId)}/photos/${ids[3]}`, manager.cookie),
      params({ weddingId, photoId: ids[3]! }),
    );
    expect(one.status).toBe(204);
    expect(testObjects().has(keys(weddingId, ids[3]!).display)).toBe(false);
    await bulk(
      request('POST', `${base(weddingId)}/photos/bulk`, admin.cookie, {
        action: 'delete',
        photoIds: [ids[0], ids[1]],
      }),
      params({ weddingId }),
    );
    const after = (await (await gallery(weddingId, admin.cookie)).json()).data;
    expect(after.counts.total).toBe(1);
    expect(after.storage.usedBytes).toBe(540_000);
  });

  it('removes uploads never confirmed after a day, and keeps confirmed ones', async () => {
    const { admin, weddingId, token } = await setup();
    const [kept] = await guestUpload(token, weddingId, 1);
    await uploads(
      request('POST', `${pub(token)}/uploads`, undefined, { files: [file('a'), file('b')] }),
      params({ token }),
    );
    let storage = (await (await gallery(weddingId, admin.cookie)).json()).data.storage;
    expect(storage.reservedBytes).toBe(1_080_000);
    await cleanupPendingPhotos(new Date(Date.now() + 25 * 60 * 60 * 1000));
    storage = (await (await gallery(weddingId, admin.cookie)).json()).data.storage;
    expect(storage).toMatchObject({ reservedBytes: 0, usedBytes: 540_000 });
    const left = await listPhotos(
      request('GET', `${base(weddingId)}/photos`, admin.cookie),
      params({ weddingId }),
    );
    expect((await left.json()).data.map((p: { id: string }) => p.id)).toEqual([kept]);
  });

  it("never shows or changes another wedding's photos", async () => {
    const mine = await setup();
    const theirs = await setup();
    const [theirPhoto] = await guestUpload(theirs.token, theirs.weddingId, 1);
    expect((await gallery(theirs.weddingId, mine.admin.cookie)).status).toBe(404);
    const patch = await patchPhoto(
      request('PATCH', `${base(mine.weddingId)}/photos/${theirPhoto}`, mine.admin.cookie, {
        hidden: true,
      }),
      params({ weddingId: mine.weddingId, photoId: theirPhoto! }),
    );
    expect(patch.status).toBe(404);
    const del = await bulk(
      request('POST', `${base(mine.weddingId)}/photos/bulk`, mine.admin.cookie, {
        action: 'delete',
        photoIds: [theirPhoto],
      }),
      params({ weddingId: mine.weddingId }),
    );
    expect((await del.json()).data.updated).toBe(0);
    // Confirming another wedding's photo through this link does nothing.
    const confirm = await complete(
      request('POST', `${pub(mine.token)}/uploads/complete`, undefined, {
        photoIds: [theirPhoto],
      }),
      params({ token: mine.token }),
    );
    expect((await confirm.json()).data).toMatchObject({ ready: [], missing: [theirPhoto] });
  });

  it('lets the team upload while guest uploads are off, and download by part', async () => {
    const { admin, weddingId, mehendi, token } = await setup();
    await patchGallery(
      request('PATCH', base(weddingId), admin.cookie, { uploadsOpen: false }),
      params({ weddingId }),
    );
    const ticket = await teamUploads(
      request('POST', `${base(weddingId)}/uploads`, admin.cookie, {
        albumEventId: mehendi,
        uploaderName: 'ignored',
        files: [file('a'), file('b')],
      }),
      params({ weddingId }),
    );
    expect(ticket.status).toBe(200);
    const ids = ((await ticket.json()).data.uploads as { photoId: string }[]).map((u) => u.photoId);
    for (const id of ids) {
      testObjects().set(keys(weddingId, id).display, webp(500_000));
      testObjects().set(keys(weddingId, id).thumb, webp(40_000));
    }
    const done = await teamComplete(
      request('POST', `${base(weddingId)}/uploads/complete`, admin.cookie, { photoIds: ids }),
      params({ weddingId }),
    );
    expect((await done.json()).data.ready).toEqual(ids);
    const listed = await listPhotos(
      request('GET', `${base(weddingId)}/photos`, admin.cookie),
      params({ weddingId }),
    );
    // Shown under the member's own name.
    expect((await listed.json()).data[0]).toMatchObject({
      uploaderName: 'Nafiya',
      albumName: 'Mehendi',
    });
    // Guests still can't.
    const guest = await uploads(
      request('POST', `${pub(token)}/uploads`, undefined, { files: [file('g')] }),
      params({ token }),
    );
    expect((await guest.json()).error.code).toBe('UPLOADS_CLOSED');

    const part = async (body: unknown) => {
      const res = await downloadUrls(
        request('POST', `${base(weddingId)}/download-urls`, admin.cookie, body),
        params({ weddingId }),
      );
      return res.json();
    };
    const all = await part({ album: 'all' });
    expect(all.meta).toMatchObject({ nextCursor: null, part: 1, totalParts: 1 });
    expect(all.data).toHaveLength(2);
    expect(all.data[0]).toMatchObject({ sizeBytes: 540_000 });
    expect(all.data[0].fileName).toMatch(/^mehendi_[0-9a-f]{8}\.webp$/);
    expect((await part({ album: 'general' })).data).toHaveLength(0);
    expect((await part({ album: mehendi })).data).toHaveLength(2);
    expect(
      (await part({ photoIds: [ids[0]] })).data.map((f: { photoId: string }) => f.photoId),
    ).toEqual([ids[0]]);
    // Other weddings' photos are never included.
    const other = await setup();
    const res = await downloadUrls(
      request('POST', `${base(weddingId)}/download-urls`, other.admin.cookie, { album: 'all' }),
      params({ weddingId }),
    );
    expect(res.status).toBe(404);
  });
});
