import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { DELETE as deleteEvent } from '@/app/api/weddings/[weddingId]/events/[eventId]/route';
import { POST as createEvent } from '@/app/api/weddings/[weddingId]/events/route';
import { POST as presign } from '@/app/api/weddings/[weddingId]/files/presign/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import {
  DELETE as removeAttachment,
  GET as openAttachment,
} from '@/app/api/weddings/[weddingId]/vendors/[vendorId]/attachments/[attachmentId]/route';
import { POST as addAttachment } from '@/app/api/weddings/[weddingId]/vendors/[vendorId]/attachments/route';
import {
  DELETE as removeVendor,
  GET as getVendor,
  PATCH as patchVendor,
} from '@/app/api/weddings/[weddingId]/vendors/[vendorId]/route';
import {
  GET as listVendors,
  POST as createVendor,
} from '@/app/api/weddings/[weddingId]/vendors/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { testObjects } from '@/lib/r2';
import { collectionSpecs } from '@/modules/collections';
import { todayIn } from '@/shared/dates';

// The vendor tracker (api-spec §14, PRD VEND-1 to VEND-7) against the Atlas test database.

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
      'x-forwarded-for': `100.64.0.${++counter % 250}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function setup() {
  const email = `vendor.${++counter}.${Date.now()}@example.com`;
  const res = await signup(
    request('POST', '/api/auth/signup', undefined, {
      name: 'Nafiya',
      email,
      password: 'correct-horse-42',
    }),
  );
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const wedding = await createWedding(
    request('POST', '/api/weddings', cookie, {
      brideName: 'Nafiya',
      groomName: 'Irfan',
      weddingDate: `${YEAR}-04-14`,
      city: 'Kochi',
    }),
  );
  const weddingId = (await wedding.json()).data.id as string;
  const event = await createEvent(
    request('POST', `/api/weddings/${weddingId}/events`, cookie, {
      name: 'Sangeet',
      date: `${YEAR}-04-13`,
      startTime: '19:00',
    }),
    params({ weddingId }),
  );
  const sangeet = (await event.json()).data.id as string;
  return { cookie, weddingId, sangeet };
}

const base = (weddingId: string) => `/api/weddings/${weddingId}/vendors`;
const add = async (weddingId: string, cookie: string, body: unknown) =>
  createVendor(request('POST', base(weddingId), cookie, body), params({ weddingId }));
const list = async (weddingId: string, cookie: string, query = '') =>
  (
    await (
      await listVendors(request('GET', `${base(weddingId)}${query}`, cookie), params({ weddingId }))
    ).json()
  ).data as { id: string; name: string }[];

/** First bytes of a real PDF, for the upload content check. */
const pdf = (sizeBytes: number) => ({
  sizeBytes,
  contentType: 'application/pdf',
  firstBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0, 0, 0]),
});

describe('vendors (Atlas test database)', () => {
  it('adds, filters, edits and deletes vendors', async () => {
    const { cookie, weddingId, sangeet } = await setup();
    const res = await add(weddingId, cookie, {
      name: 'Lens & Light Studios',
      category: 'photographer',
      contactName: 'Rohan Varma',
      contactRole: 'Lead photographer',
      phone: '98450 23114',
      whatsapp: '+91 98450 23114',
      email: ' Hello@LensLight.example ',
      eventIds: [sangeet],
      contractAmountPaise: 15_000_000,
    });
    expect(res.status).toBe(201);
    const vendor = (await res.json()).data;
    expect(vendor).toMatchObject({
      name: 'Lens & Light Studios',
      category: 'photographer',
      contactName: 'Rohan Varma',
      phone: '+919845023114',
      whatsapp: '+919845023114',
      email: 'hello@lenslight.example',
      status: 'shortlisted',
      eventIds: [sangeet],
      contractAmountPaise: 15_000_000,
      attachments: [],
      editedBy: { name: 'Nafiya' },
    });
    await add(weddingId, cookie, { name: 'Royal Caterers', category: 'caterer', status: 'booked' });

    const bad = await add(weddingId, cookie, { name: '', category: 'astronaut', phone: '12' });
    expect(bad.status).toBe(400);
    const otherEvent = await add(weddingId, cookie, {
      name: 'X',
      category: 'other',
      eventIds: ['66f1d0000000000000000099'],
    });
    expect((await otherEvent.json()).error.details[0].path).toBe('eventIds');

    expect((await list(weddingId, cookie)).map((v) => v.name)).toEqual([
      'Lens & Light Studios',
      'Royal Caterers',
    ]);
    expect((await list(weddingId, cookie, '?status=booked')).map((v) => v.name)).toEqual([
      'Royal Caterers',
    ]);
    expect((await list(weddingId, cookie, '?category=photographer,florist')).length).toBe(1);
    expect((await list(weddingId, cookie, `?eventId=${sangeet}`)).length).toBe(1);
    expect((await list(weddingId, cookie, '?q=rohan')).length).toBe(1);

    const edited = await patchVendor(
      request('PATCH', `${base(weddingId)}/${vendor.id}`, cookie, {
        status: 'booked',
        contractAmountPaise: null,
      }),
      params({ weddingId, vendorId: vendor.id }),
    );
    expect((await edited.json()).data).toMatchObject({
      status: 'booked',
      contractAmountPaise: null,
    });

    // Deleting the event takes it off the vendor.
    await deleteEvent(
      request('DELETE', `/api/weddings/${weddingId}/events/${sangeet}`, cookie),
      params({ weddingId, eventId: sangeet }),
    );
    const after = await getVendor(
      request('GET', `${base(weddingId)}/${vendor.id}`, cookie),
      params({ weddingId, vendorId: vendor.id }),
    );
    expect((await after.json()).data.eventIds).toEqual([]);

    const removed = await removeVendor(
      request('DELETE', `${base(weddingId)}/${vendor.id}`, cookie),
      params({ weddingId, vendorId: vendor.id }),
    );
    expect(removed.status).toBe(204);
    expect((await list(weddingId, cookie)).map((v) => v.name)).toEqual(['Royal Caterers']);
  });

  it('keeps quotes and contracts: only this vendor’s real images or PDFs, at most 10', async () => {
    const { cookie, weddingId } = await setup();
    const vendor = (
      await (await add(weddingId, cookie, { name: 'Royal Petals', category: 'decorator' })).json()
    ).data;
    const other = (
      await (await add(weddingId, cookie, { name: 'DJ Sahil', category: 'dj_music' })).json()
    ).data;

    // An upload URL needs the vendor, and lands in that vendor's folder.
    const noVendor = await presign(
      request('POST', `/api/weddings/${weddingId}/files/presign`, cookie, {
        purpose: 'vendor_attachment',
        fileName: 'quote.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1000,
      }),
      params({ weddingId }),
    );
    expect(noVendor.status).toBe(400);
    const signed = await presign(
      request('POST', `/api/weddings/${weddingId}/files/presign`, cookie, {
        purpose: 'vendor_attachment',
        fileName: 'quote.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1000,
        vendorId: vendor.id,
      }),
      params({ weddingId }),
    );
    const { key } = (await signed.json()).data;
    expect(key).toMatch(new RegExp(`^weddings/${weddingId}/vendors/${vendor.id}/.+\\.pdf$`));

    const attach = (vendorId: string, body: unknown) =>
      addAttachment(
        request('POST', `${base(weddingId)}/${vendorId}/attachments`, cookie, body),
        params({ weddingId, vendorId }),
      );
    // Not uploaded yet; then uploaded but claimed by another vendor.
    expect(
      (await (await attach(vendor.id, { key, fileName: 'quote.pdf' })).json()).error.code,
    ).toBe('FILE_NOT_UPLOADED');
    testObjects().set(key, pdf(1000));
    expect((await (await attach(other.id, { key, fileName: 'quote.pdf' })).json()).error.code).toBe(
      'FILE_NOT_UPLOADED',
    );

    const saved = await attach(vendor.id, { key, fileName: 'quote.pdf' });
    expect(saved.status).toBe(201);
    const attachment = (await saved.json()).data.attachments[0];
    expect(attachment).toMatchObject({ fileName: 'quote.pdf', contentType: 'application/pdf' });

    // A text file renamed to .pdf is refused by its content, and removed.
    const fakeKey = `weddings/${weddingId}/vendors/${vendor.id}/fake.pdf`;
    testObjects().set(fakeKey, {
      sizeBytes: 10,
      contentType: 'application/pdf',
      firstBytes: new TextEncoder().encode('hello world!'),
    });
    expect(
      (await (await attach(vendor.id, { key: fakeKey, fileName: 'fake.pdf' })).json()).error.code,
    ).toBe('UNSUPPORTED_FILE_TYPE');
    expect(testObjects().has(fakeKey)).toBe(false);

    const open = await openAttachment(
      request('GET', `${base(weddingId)}/${vendor.id}/attachments/${attachment.id}`, cookie),
      params({ weddingId, vendorId: vendor.id, attachmentId: attachment.id }),
    );
    expect(open.status).toBe(302);
    expect(open.headers.get('location')).toContain(key.split('/').pop());

    // Up to 10 files.
    for (let i = 0; i < 9; i++) {
      const k = `weddings/${weddingId}/vendors/${vendor.id}/extra-${i}.pdf`;
      testObjects().set(k, pdf(100));
      expect((await attach(vendor.id, { key: k, fileName: `extra-${i}.pdf` })).status).toBe(201);
    }
    const eleventh = `weddings/${weddingId}/vendors/${vendor.id}/eleventh.pdf`;
    testObjects().set(eleventh, pdf(100));
    expect(
      (await (await attach(vendor.id, { key: eleventh, fileName: 'x.pdf' })).json()).error.code,
    ).toBe('ATTACHMENT_LIMIT_REACHED');

    const del = await removeAttachment(
      request('DELETE', `${base(weddingId)}/${vendor.id}/attachments/${attachment.id}`, cookie),
      params({ weddingId, vendorId: vendor.id, attachmentId: attachment.id }),
    );
    expect(del.status).toBe(204);
    expect(testObjects().has(key)).toBe(false);

    // Deleting the vendor deletes its remaining files.
    await removeVendor(
      request('DELETE', `${base(weddingId)}/${vendor.id}`, cookie),
      params({ weddingId, vendorId: vendor.id }),
    );
    expect(testObjects().has(`weddings/${weddingId}/vendors/${vendor.id}/extra-0.pdf`)).toBe(false);
  });

  it("never shows or changes another wedding's vendors", async () => {
    const mine = await setup();
    const theirs = await setup();
    const vendor = (
      await (
        await add(mine.weddingId, mine.cookie, {
          name: 'Glow by Natasha',
          category: 'makeup_artist',
        })
      ).json()
    ).data;
    const peek = await getVendor(
      request('GET', `${base(mine.weddingId)}/${vendor.id}`, theirs.cookie),
      params({ weddingId: mine.weddingId, vendorId: vendor.id }),
    );
    expect(peek.status).toBe(404);
    // Their own wedding's URL with my vendor's id finds nothing either.
    const cross = await patchVendor(
      request('PATCH', `${base(theirs.weddingId)}/${vendor.id}`, theirs.cookie, {
        status: 'booked',
      }),
      params({ weddingId: theirs.weddingId, vendorId: vendor.id }),
    );
    expect(cross.status).toBe(404);
    expect(await list(theirs.weddingId, theirs.cookie)).toEqual([]);
  });
});
