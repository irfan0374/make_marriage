import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as accept } from '@/app/api/member-invites/[token]/accept/route';
import { DELETE as deleteEvent } from '@/app/api/weddings/[weddingId]/events/[eventId]/route';
import { POST as createEvent } from '@/app/api/weddings/[weddingId]/events/route';
import {
  GET as getCategories,
  PUT as putCategories,
} from '@/app/api/weddings/[weddingId]/expense-categories/route';
import { GET as openReceipt } from '@/app/api/weddings/[weddingId]/expenses/[expenseId]/receipt/route';
import {
  DELETE as removeExpense,
  PATCH as patchExpense,
} from '@/app/api/weddings/[weddingId]/expenses/[expenseId]/route';
import { GET as exportExpenses } from '@/app/api/weddings/[weddingId]/expenses/export/route';
import {
  GET as listExpenses,
  POST as createExpense,
} from '@/app/api/weddings/[weddingId]/expenses/route';
import { GET as summary } from '@/app/api/weddings/[weddingId]/expenses/summary/route';
import { POST as createInvite } from '@/app/api/weddings/[weddingId]/members/invites/route';
import { DELETE as removeVendor } from '@/app/api/weddings/[weddingId]/vendors/[vendorId]/route';
import { POST as createVendor } from '@/app/api/weddings/[weddingId]/vendors/route';
import { POST as createWedding } from '@/app/api/weddings/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { testObjects } from '@/lib/r2';
import { collectionSpecs } from '@/modules/collections';
import { parseCsv } from '@/shared/csv';
import { todayIn } from '@/shared/dates';

// The expense tracker (api-spec §13, PRD EXP-1 to EXP-8) against the Atlas test database.

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
      'x-forwarded-for': `100.70.0.${++counter % 250}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function newUser(name: string) {
  const email = `${name.toLowerCase()}.exp.${++counter}.${Date.now()}@example.com`;
  const res = await signup(
    request('POST', '/api/auth/signup', undefined, { name, email, password: 'correct-horse-42' }),
  );
  const body = await res.json();
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, email, id: body.data.user.id };
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
      name: 'Sangeet',
      date: `${YEAR}-04-13`,
      startTime: '19:00',
    }),
    params({ weddingId }),
  );
  const sangeet = (await event.json()).data.id as string;
  const vendor = await createVendor(
    request('POST', `/api/weddings/${weddingId}/vendors`, admin.cookie, {
      name: 'Royal Caterers',
      category: 'caterer',
      contractAmountPaise: 34_000_000,
    }),
    params({ weddingId }),
  );
  const caterer = (await vendor.json()).data.id as string;
  return { admin, weddingId, sangeet, caterer };
}

const base = (weddingId: string) => `/api/weddings/${weddingId}/expenses`;
const add = (weddingId: string, cookie: string, body: unknown) =>
  createExpense(request('POST', base(weddingId), cookie, body), params({ weddingId }));
const list = async (weddingId: string, cookie: string, query = '') => {
  const res = await listExpenses(
    request('GET', `${base(weddingId)}${query}`, cookie),
    params({ weddingId }),
  );
  return res.json();
};
const totals = async (weddingId: string, cookie: string, query = '') =>
  (
    await (
      await summary(
        request('GET', `${base(weddingId)}/summary${query}`, cookie),
        params({ weddingId }),
      )
    ).json()
  ).data;

describe('expenses (Atlas test database)', () => {
  it('logs expenses with a vendor, event and payer, and totals them', async () => {
    const { admin, weddingId, sangeet, caterer } = await setup();
    const res = await add(weddingId, admin.cookie, {
      amountPaise: 10_200_000,
      date: `${YEAR}-03-28`,
      category: 'catering',
      description: 'Catering tasting & 30% advance',
      eventId: sangeet,
      vendorId: caterer,
      paidBy: { type: 'member', userId: admin.id },
      notes: 'UPI ref 12345',
    });
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({
      amountPaise: 10_200_000,
      category: 'catering',
      eventId: sangeet,
      vendor: { id: caterer, name: 'Royal Caterers' },
      paidBy: { type: 'member', userId: admin.id, name: 'Nafiya' },
      receipt: null,
      editedBy: { name: 'Nafiya' },
    });
    await add(weddingId, admin.cookie, {
      amountPaise: 90_000_000,
      date: `${YEAR}-04-04`,
      category: 'venue',
      description: 'Grand Ballroom advance',
      paidBy: { type: 'name', name: 'Papa' },
    });
    await add(weddingId, admin.cookie, {
      amountPaise: 5_000_050,
      date: `${YEAR}-02-01`,
      category: 'catering',
      description: 'Second payment',
      vendorId: caterer,
      paidBy: { type: 'name', name: 'Papa' },
    });

    // Validation: amount at least ₹1, a real category, this wedding's event, vendor and member.
    const bad = await add(weddingId, admin.cookie, {
      amountPaise: 50,
      date: 'yesterday',
      category: 'spaceships',
      description: '',
      paidBy: { type: 'name', name: '' },
    });
    expect(bad.status).toBe(400);
    const unknownCategory = await add(weddingId, admin.cookie, {
      amountPaise: 100,
      date: `${YEAR}-01-01`,
      category: 'Spaceships',
      description: 'x',
      paidBy: { type: 'name', name: 'Papa' },
    });
    expect((await unknownCategory.json()).error.details[0].path).toBe('category');
    const stranger = await newUser('Riya');
    const notMember = await add(weddingId, admin.cookie, {
      amountPaise: 100,
      date: `${YEAR}-01-01`,
      category: 'gifts',
      description: 'x',
      paidBy: { type: 'member', userId: stranger.id },
    });
    expect((await notMember.json()).error.details[0].path).toBe('paidBy');

    const all = await list(weddingId, admin.cookie);
    expect(all.data.map((e: { description: string }) => e.description)).toEqual([
      'Grand Ballroom advance',
      'Catering tasting & 30% advance',
      'Second payment',
    ]);
    expect(all.meta).toMatchObject({ total: 3, totalAmountPaise: 105_200_050 });

    const catering = await list(weddingId, admin.cookie, '?category=catering&sort=-amountPaise');
    expect(catering.meta.totalAmountPaise).toBe(15_200_050);
    expect((await list(weddingId, admin.cookie, '?eventId=general')).meta.total).toBe(2);
    expect((await list(weddingId, admin.cookie, `?vendorId=${caterer}`)).meta.total).toBe(2);
    expect((await list(weddingId, admin.cookie, '?paidBy=Papa')).meta.total).toBe(2);
    expect((await list(weddingId, admin.cookie, '?q=ballroom')).meta.total).toBe(1);
    expect(
      (await list(weddingId, admin.cookie, `?from=${YEAR}-03-01&to=${YEAR}-03-31`)).meta.total,
    ).toBe(1);

    const sum = await totals(weddingId, admin.cookie);
    expect(sum).toMatchObject({
      totalAmountPaise: 105_200_050,
      count: 3,
      byCategory: [
        { category: 'venue', amountPaise: 90_000_000 },
        { category: 'catering', amountPaise: 15_200_050 },
      ],
      byVendor: [{ vendorId: caterer, name: 'Royal Caterers', amountPaise: 15_200_050 }],
      byPaidBy: [
        { name: 'Papa', amountPaise: 95_000_050 },
        { name: 'Nafiya', amountPaise: 10_200_000 },
      ],
    });
    expect(sum.byEvent).toEqual(
      expect.arrayContaining([
        { eventId: null, name: 'General', amountPaise: 95_000_050 },
        { eventId: sangeet, name: 'Sangeet', amountPaise: 10_200_000 },
      ]),
    );

    // Deleting the event moves its expenses to General; deleting the vendor keeps its name.
    await deleteEvent(
      request('DELETE', `/api/weddings/${weddingId}/events/${sangeet}`, admin.cookie),
      params({ weddingId, eventId: sangeet }),
    );
    await removeVendor(
      request('DELETE', `/api/weddings/${weddingId}/vendors/${caterer}`, admin.cookie),
      params({ weddingId, vendorId: caterer }),
    );
    const after = await list(weddingId, admin.cookie, '?q=tasting');
    expect(after.data[0]).toMatchObject({
      eventId: null,
      vendor: { id: null, name: 'Royal Caterers' },
    });

    const csv = parseCsv(
      (
        await (
          await exportExpenses(
            request('GET', `${base(weddingId)}/export?category=venue`, admin.cookie),
            params({ weddingId }),
          )
        ).text()
      ).replace(/^﻿/, ''),
    ).filter((row) => row.length > 1);
    expect(csv).toEqual([
      [
        'Date',
        'Description',
        'Category',
        'Amount (₹)',
        'Event',
        'Vendor',
        'Paid by',
        'Notes',
        'Receipt',
      ],
      [
        `${YEAR}-04-04`,
        'Grand Ballroom advance',
        'Venue',
        '900000.00',
        'General',
        '',
        'Papa',
        '',
        '',
      ],
    ]);
  });

  it('keeps a real receipt, replaces it and deletes it with the expense', async () => {
    const { admin, weddingId } = await setup();
    const pdf = {
      sizeBytes: 2000,
      contentType: 'application/pdf',
      firstBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0, 0, 0]),
    };
    const first = `weddings/${weddingId}/receipts/first.pdf`;
    const second = `weddings/${weddingId}/receipts/second.pdf`;
    testObjects().set(first, pdf);
    testObjects().set(second, pdf);

    const res = await add(weddingId, admin.cookie, {
      amountPaise: 7_500_000,
      date: `${YEAR}-03-12`,
      category: 'photography_video',
      description: 'Photographer advance',
      paidBy: { type: 'name', name: 'Uncle Rajesh' },
      receipt: { key: first, fileName: 'advance.pdf' },
    });
    const expense = (await res.json()).data;
    expect(expense.receipt).toEqual({
      fileName: 'advance.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2000,
    });
    const open = await openReceipt(
      request('GET', `${base(weddingId)}/${expense.id}/receipt`, admin.cookie),
      params({ weddingId, expenseId: expense.id }),
    );
    expect(open.status).toBe(302);

    // Another wedding's file can't be claimed.
    const foreign = await patchExpense(
      request('PATCH', `${base(weddingId)}/${expense.id}`, admin.cookie, {
        receipt: { key: 'weddings/66f1b0000000000000000999/receipts/x.pdf', fileName: 'x.pdf' },
      }),
      params({ weddingId, expenseId: expense.id }),
    );
    expect((await foreign.json()).error.code).toBe('FILE_NOT_UPLOADED');

    await patchExpense(
      request('PATCH', `${base(weddingId)}/${expense.id}`, admin.cookie, {
        receipt: { key: second, fileName: 'balance.pdf' },
      }),
      params({ weddingId, expenseId: expense.id }),
    );
    expect(testObjects().has(first)).toBe(false);

    const removed = await removeExpense(
      request('DELETE', `${base(weddingId)}/${expense.id}`, admin.cookie),
      params({ weddingId, expenseId: expense.id }),
    );
    expect(removed.status).toBe(204);
    expect(testObjects().has(second)).toBe(false);
  });

  it('lets Admins manage custom categories, but not remove one in use', async () => {
    const { admin, weddingId } = await setup();
    const put = (cookie: string, categories: string[]) =>
      putCategories(
        request('PUT', `/api/weddings/${weddingId}/expense-categories`, cookie, { categories }),
        params({ weddingId }),
      );
    expect((await put(admin.cookie, ['Mehendi artist', 'Priest'])).status).toBe(200);
    expect((await (await put(admin.cookie, ['Venue'])).json()).error.code).toBe('VALIDATION_ERROR');
    expect((await (await put(admin.cookie, ['Priest', 'priest'])).json()).error.code).toBe(
      'VALIDATION_ERROR',
    );

    const saved = await add(weddingId, admin.cookie, {
      amountPaise: 300_000,
      date: `${YEAR}-04-12`,
      category: 'mehendi artist',
      description: 'Mehendi for the bride',
      paidBy: { type: 'name', name: 'Papa' },
    });
    // Saved in the category's own spelling.
    expect((await saved.json()).data.category).toBe('Mehendi artist');

    const inUse = await put(admin.cookie, ['Priest']);
    expect(inUse.status).toBe(409);
    expect((await inUse.json()).error).toMatchObject({
      code: 'CATEGORY_IN_USE',
      details: { category: 'Mehendi artist', expenses: 1 },
    });

    // A Manager can read the list and log expenses, but not change categories.
    const manager = await newUser('Ahmed');
    const invite = await createInvite(
      request('POST', `/api/weddings/${weddingId}/members/invites`, admin.cookie, {
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
    expect((await put(manager.cookie, [])).status).toBe(403);
    const read = await getCategories(
      request('GET', `/api/weddings/${weddingId}/expense-categories`, manager.cookie),
      params({ weddingId }),
    );
    expect((await read.json()).data).toEqual(['Mehendi artist', 'Priest']);
    const logged = await add(weddingId, manager.cookie, {
      amountPaise: 100_000,
      date: `${YEAR}-04-12`,
      category: 'Priest',
      description: 'Pooja',
      paidBy: { type: 'member', userId: manager.id },
    });
    expect(logged.status).toBe(201);
  });

  it("never shows or changes another wedding's expenses", async () => {
    const mine = await setup();
    const theirs = await setup();
    const res = await add(mine.weddingId, mine.admin.cookie, {
      amountPaise: 100_000,
      date: `${YEAR}-01-01`,
      category: 'gifts',
      description: 'Return gifts',
      paidBy: { type: 'name', name: 'Papa' },
    });
    const expense = (await res.json()).data;
    const peek = await list(mine.weddingId, theirs.admin.cookie);
    expect(peek.error.code).toBe('NOT_FOUND');
    const cross = await patchExpense(
      request('PATCH', `${base(theirs.weddingId)}/${expense.id}`, theirs.admin.cookie, {
        amountPaise: 1_000,
      }),
      params({ weddingId: theirs.weddingId, expenseId: expense.id }),
    );
    expect(cross.status).toBe(404);
    // Linking another wedding's vendor is refused too.
    const otherVendor = await add(theirs.weddingId, theirs.admin.cookie, {
      amountPaise: 100_000,
      date: `${YEAR}-01-01`,
      category: 'gifts',
      description: 'x',
      vendorId: mine.caterer,
      paidBy: { type: 'name', name: 'Papa' },
    });
    expect((await otherVendor.json()).error.details[0].path).toBe('vendorId');
  });
});
