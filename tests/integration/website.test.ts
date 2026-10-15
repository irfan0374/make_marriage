import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import { GET as siteImage } from '@/app/api/public/sites/[slug]/images/[file]/route';
import { GET as publicSite } from '@/app/api/public/sites/[slug]/route';
import { PATCH as patchEvent } from '@/app/api/weddings/[weddingId]/events/[eventId]/route';
import { POST as createEvent } from '@/app/api/weddings/[weddingId]/events/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { POST as publish } from '@/app/api/weddings/[weddingId]/website/publish/route';
import {
  GET as getWebsite,
  PATCH as patchWebsite,
} from '@/app/api/weddings/[weddingId]/website/route';
import { GET as slugCheck } from '@/app/api/weddings/[weddingId]/website/slug-check/route';
import { PUT as putSlug } from '@/app/api/weddings/[weddingId]/website/slug/route';
import { POST as unpublish } from '@/app/api/weddings/[weddingId]/website/unpublish/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { testObjects } from '@/lib/r2';
import { collectionSpecs } from '@/modules/collections';
import { saveWebsiteFields } from '@/modules/weddings';
import { trustWeddingId, toObjectId } from '@/lib/ids';
import { todayIn } from '@/shared/dates';

// The wedding website and live stream (api-spec §17–18, PRD §5.9) against the Atlas test
// database.

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
      'x-forwarded-for': `100.64.1.${++counter % 250}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function newUser(name: string) {
  const email = `${name.toLowerCase()}.web.${++counter}.${Date.now()}@example.com`;
  const res = await signup(
    request('POST', '/api/auth/signup', undefined, { name, email, password: 'correct-horse-42' }),
  );
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, email };
}

/** A wedding with unusual names, so its suggested address is unique to this run. */
async function setup() {
  const admin = await newUser('Nafiya');
  const tag = `${Date.now().toString(36)}${++counter}`;
  const wedding = await createWedding(
    request('POST', '/api/weddings', admin.cookie, {
      brideName: `Nafiya${tag}`,
      groomName: 'Irfan',
      weddingDate: `${YEAR}-04-14`,
      city: 'Kochi',
    }),
  );
  const weddingId = (await wedding.json()).data.id as string;
  return { admin, weddingId };
}

const base = (weddingId: string) => `/api/weddings/${weddingId}/website`;
const read = async (weddingId: string, cookie: string) =>
  getWebsite(request('GET', base(weddingId), cookie), params({ weddingId }));
const patch = (weddingId: string, cookie: string, body: unknown) =>
  patchWebsite(request('PATCH', base(weddingId), cookie, body), params({ weddingId }));
const site = (slug: string) =>
  publicSite(request('GET', `/api/public/sites/${slug}`), params({ slug }));

/** A real JPEG's first bytes, for the upload content check. */
const jpeg = {
  sizeBytes: 150_000,
  contentType: 'image/jpeg',
  firstBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
};

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

describe('wedding website (Atlas test database)', () => {
  it('starts as a draft and saves the look, story, images and live stream', async () => {
    const { admin, weddingId } = await setup();
    const start = (await (await read(weddingId, admin.cookie)).json()).data;
    expect(start).toMatchObject({
      published: false,
      theme: 'classic',
      accentColor: '#4A2545',
      sections: { hero: true, story: true, events: true, photos: true, liveStream: true },
      story: '',
      cover: null,
      photos: [],
      liveStream: null,
      indexable: false,
    });
    expect(start.slug).toMatch(new RegExp(`-14-apr-${YEAR}$`));
    expect(start.url).toBe(`http://localhost:3000/w/${start.slug}`);

    const saved = await patch(weddingId, admin.cookie, {
      theme: 'elegant',
      accentColor: '#2a6f72',
      story: 'We met at a friend’s wedding.',
      sections: { photos: false },
    });
    expect((await saved.json()).data).toMatchObject({
      theme: 'elegant',
      accentColor: '#2A6F72',
      story: 'We met at a friend’s wedding.',
      sections: { photos: false, story: true },
    });
    expect((await patch(weddingId, admin.cookie, { accentColor: '#FF0000' })).status).toBe(400);
    expect((await patch(weddingId, admin.cookie, { theme: 'floral' })).status).toBe(400);

    // Only YouTube's own domains, and only links to a video.
    for (const url of [
      'https://vimeo.com/123',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/@channel',
    ]) {
      const res = await patch(weddingId, admin.cookie, {
        liveStream: { url, startsAt: null, enabled: true },
      });
      expect((await res.json()).error.code).toBe('INVALID_YOUTUBE_URL');
    }
    for (const [url, id] of [
      ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'],
      ['https://youtube.com/live/abcdefghijk?feature=share', 'abcdefghijk'],
    ] as const) {
      const res = await patch(weddingId, admin.cookie, {
        liveStream: { url, startsAt: `${YEAR}-04-14T05:30:00.000Z`, enabled: true },
      });
      expect((await res.json()).data.liveStream).toMatchObject({
        videoId: id,
        startsAt: `${YEAR}-04-14T05:30:00.000Z`,
      });
    }

    // Images must be this wedding's real uploads; removed ones are deleted from storage.
    const cover = `weddings/${weddingId}/website/cover.jpg`;
    const p1 = `weddings/${weddingId}/website/p1.jpg`;
    const p2 = `weddings/${weddingId}/website/p2.jpg`;
    for (const key of [cover, p1, p2]) testObjects().set(key, jpeg);
    const missing = await patch(weddingId, admin.cookie, {
      photoKeys: [`weddings/${weddingId}/website/nope.jpg`],
    });
    expect((await missing.json()).error.code).toBe('FILE_NOT_UPLOADED');
    const withImages = await patch(weddingId, admin.cookie, {
      coverKey: cover,
      photoKeys: [p1, p2],
    });
    const body = (await withImages.json()).data;
    expect(body.cover.key).toBe(cover);
    expect(body.photos.map((p: { key: string }) => p.key)).toEqual([p1, p2]);
    expect(body.photos[0].url).toContain('https://r2.test/bucket/');
    expect((await patch(weddingId, admin.cookie, { photoKeys: Array(13).fill(p1) })).status).toBe(
      400,
    );

    await patch(weddingId, admin.cookie, { photoKeys: [p2], coverKey: null });
    expect(testObjects().has(p1)).toBe(false);
    expect(testObjects().has(cover)).toBe(false);
    expect(testObjects().has(p2)).toBe(true);
  });

  it('is public only once published, with only the chosen events and sections', async () => {
    const { admin, weddingId } = await setup();
    const slug = (await (await read(weddingId, admin.cookie)).json()).data.slug as string;
    const event = async (name: string, date: string) =>
      (
        await (
          await createEvent(
            request('POST', `/api/weddings/${weddingId}/events`, admin.cookie, {
              name,
              date,
              startTime: '11:00',
              presetKey: name === 'Wedding' ? 'wedding' : 'custom',
            }),
            params({ weddingId }),
          )
        ).json()
      ).data.id as string;
    await event('Wedding', `${YEAR}-04-14`);
    const hidden = await event('Family lunch', `${YEAR}-04-15`);
    await patchEvent(
      request('PATCH', `/api/weddings/${weddingId}/events/${hidden}`, admin.cookie, {
        showOnWebsite: false,
      }),
      params({ weddingId, eventId: hidden }),
    );
    const cover = `weddings/${weddingId}/website/cover.jpg`;
    testObjects().set(cover, jpeg);
    await patch(weddingId, admin.cookie, {
      coverKey: cover,
      story: 'Our story',
      sections: { liveStream: false },
      liveStream: { url: 'https://youtu.be/dQw4w9WgXcQ', startsAt: null, enabled: true },
    });

    // A draft looks exactly like an unknown address, to anyone.
    expect((await site(slug)).status).toBe(404);
    expect((await site('no-such-wedding-address')).status).toBe(404);
    const draftImage = await siteImage(
      request('GET', `/api/public/sites/${slug}/images/cover.jpg`),
      params({ slug, file: 'cover.jpg' }),
    );
    expect(draftImage.status).toBe(404);
    // The team can see its own draft's images (the preview).
    const teamImage = await siteImage(
      request('GET', `/api/public/sites/${slug}/images/cover.jpg`, admin.cookie),
      params({ slug, file: 'cover.jpg' }),
    );
    expect(teamImage.status).toBe(302);

    const published = await publish(
      request('POST', `${base(weddingId)}/publish`, admin.cookie),
      params({ weddingId }),
    );
    expect((await published.json()).data).toMatchObject({ published: true });
    const res = await site(slug);
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data).toMatchObject({
      slug,
      city: 'Kochi',
      story: 'Our story',
      liveStream: null,
      galleryUrl: expect.stringMatching(/^http:\/\/localhost:3000\/gallery\/[A-Za-z0-9_-]{22}$/),
      indexable: false,
      hero: { coverUrl: `http://localhost:3000/api/public/sites/${slug}/images/cover.jpg` },
      og: { title: expect.stringContaining(`14 April ${YEAR}`), description: 'Join us in Kochi' },
    });
    expect(
      data.events.map((e: { name: string; highlight: boolean }) => [e.name, e.highlight]),
    ).toEqual([['Wedding', true]]);

    // Images: anyone, through a redirect to a fresh signed link; only this site's own files.
    const image = await siteImage(
      request('GET', `/api/public/sites/${slug}/images/cover.jpg`),
      params({ slug, file: 'cover.jpg' }),
    );
    expect(image.status).toBe(302);
    expect(image.headers.get('location')).toContain('https://r2.test/bucket/');
    const other = await siteImage(
      request('GET', `/api/public/sites/${slug}/images/receipt.pdf`),
      params({ slug, file: 'receipt.pdf' }),
    );
    expect(other.status).toBe(404);

    await unpublish(
      request('POST', `${base(weddingId)}/unpublish`, admin.cookie),
      params({ weddingId }),
    );
    expect((await site(slug)).status).toBe(404);
  });

  it('lets Admins change the address and publish; Managers edit the content only', async () => {
    const { admin, weddingId } = await setup();
    const other = await setup();
    const taken = (await (await read(other.weddingId, other.admin.cookie)).json()).data.slug;
    const check = async (slug: string, cookie = admin.cookie) =>
      (
        await slugCheck(
          request('GET', `${base(weddingId)}/slug-check?slug=${encodeURIComponent(slug)}`, cookie),
          params({ weddingId }),
        )
      ).json();

    expect((await check('admin')).data).toMatchObject({ available: false, reason: 'reserved' });
    expect((await check('Two  Words')).data).toMatchObject({ available: false, reason: 'invalid' });
    expect((await check(taken)).data).toMatchObject({
      available: false,
      reason: 'taken',
      suggestion: `${taken}-2`,
    });
    const fresh = `nafiya-irfan-${Date.now().toString(36)}`;
    expect((await check(fresh)).data).toMatchObject({ available: true });

    const put = (slug: string, cookie = admin.cookie) =>
      putSlug(request('PUT', `${base(weddingId)}/slug`, cookie, { slug }), params({ weddingId }));
    expect((await (await put(taken)).json()).error.code).toBe('SLUG_TAKEN');
    expect((await (await put('login')).json()).error.code).toBe('SLUG_RESERVED');
    expect((await (await put(fresh)).json()).data).toMatchObject({
      slug: fresh,
      url: `http://localhost:3000/w/${fresh}`,
    });

    const manager = await addManager(weddingId, admin.cookie);
    expect((await patch(weddingId, manager.cookie, { story: 'From Ahmed' })).status).toBe(200);
    expect((await patch(weddingId, manager.cookie, { indexable: true })).status).toBe(403);
    expect((await put(`${fresh}-x`, manager.cookie)).status).toBe(403);
    expect((await check(fresh, manager.cookie)).error.code).toBe('FORBIDDEN');
    const managerPublish = await publish(
      request('POST', `${base(weddingId)}/publish`, manager.cookie),
      params({ weddingId }),
    );
    expect(managerPublish.status).toBe(403);
    expect((await patch(weddingId, admin.cookie, { indexable: true })).status).toBe(200);
  });

  it("never shows or changes another wedding's website", async () => {
    const mine = await setup();
    const theirs = await setup();
    expect((await read(theirs.weddingId, mine.admin.cookie)).status).toBe(404);
    expect((await patch(theirs.weddingId, mine.admin.cookie, { story: 'x' })).status).toBe(404);
    // Another wedding's upload can't become this site's cover.
    const theirKey = `weddings/${theirs.weddingId}/website/cover.jpg`;
    testObjects().set(theirKey, jpeg);
    const res = await patch(mine.weddingId, mine.admin.cookie, { coverKey: theirKey });
    expect((await res.json()).error.code).toBe('FILE_NOT_UPLOADED');
    const theirPublish = await publish(
      request('POST', `${base(theirs.weddingId)}/publish`, mine.admin.cookie),
      params({ weddingId: theirs.weddingId }),
    );
    expect(theirPublish.status).toBe(404);
  });

  it('saves only the fields sent, and refuses image changes made from a stale list', async () => {
    const { admin, weddingId } = await setup();
    const id = trustWeddingId(toObjectId(weddingId));
    const manager = await addManager(weddingId, admin.cookie);
    await publish(
      request('POST', `${base(weddingId)}/publish`, admin.cookie),
      params({ weddingId }),
    );

    // A Manager's content save after the Admin unpublishes never publishes it again, and keeps
    // the Admin's indexing choice and address.
    await patch(weddingId, admin.cookie, { indexable: true });
    await unpublish(
      request('POST', `${base(weddingId)}/unpublish`, admin.cookie),
      params({ weddingId }),
    );
    const saved = (await (await patch(weddingId, manager.cookie, { story: 'Hello' })).json()).data;
    expect(saved).toMatchObject({ published: false, indexable: true, story: 'Hello' });
    const sections = await patch(weddingId, manager.cookie, { sections: { story: false } });
    expect((await sections.json()).data.sections).toMatchObject({ story: false, hero: true });

    // Someone else changed the photos after this list was read: refused, nothing changes.
    const p1 = `weddings/${weddingId}/website/a.jpg`;
    const p2 = `weddings/${weddingId}/website/b.jpg`;
    for (const key of [p1, p2]) testObjects().set(key, jpeg);
    await patch(weddingId, admin.cookie, { photoKeys: [p1] });
    await expect(
      saveWebsiteFields(id, { photoKeys: [p2] }, { photoKeys: [] }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const now = (await (await read(weddingId, admin.cookie)).json()).data;
    expect(now.photos.map((p: { key: string }) => p.key)).toEqual([p1]);

    // An image still used elsewhere on the site (here as the cover too) is never deleted.
    await patch(weddingId, admin.cookie, { coverKey: p1 });
    await patch(weddingId, admin.cookie, { photoKeys: [p2] });
    expect(testObjects().has(p1)).toBe(true);
  });
});
