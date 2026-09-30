import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { POST as signup } from '@/app/api/auth/signup/route';
import { GET as me } from '@/app/api/me/route';
import { getDb } from '@/lib/db/client';
import { applyCollectionSpecs } from '@/lib/db/indexes';
import { collectionSpecs } from '@/modules/collections';

// Sign-up, login, session and logout end to end against the Atlas test database.

beforeAll(async () => {
  await applyCollectionSpecs(getDb(), collectionSpecs);
});

let ipCounter = 0;
function post(path: string, body?: unknown, cookie?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      // A fresh IP per request keeps the per-IP limits out of the way.
      'x-forwarded-for': `198.51.100.${++ipCounter}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

const sessionCookie = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]!;
const getMe = (cookie?: string) =>
  me(new NextRequest('http://localhost/api/me', { headers: cookie ? { cookie } : {} }));

describe('auth (Atlas test database)', () => {
  const account = { name: 'Irfan', email: 'Irfan@Example.com', password: 'correct-horse-42' };

  it('signs up, reads /api/me, logs out, and logs back in', async () => {
    const created = await signup(post('/api/auth/signup', account));
    expect(created.status).toBe(201);
    const cookie = sessionCookie(created);

    const meRes = await getMe(cookie);
    expect((await meRes.json()).data.user).toMatchObject({
      email: 'irfan@example.com',
      name: 'Irfan',
    });

    const stored = await getDb().collection('users').findOne({ email: 'irfan@example.com' });
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    // The cookie value is never stored as is.
    expect(
      await getDb()
        .collection('sessions')
        .countDocuments({ tokenHash: cookie.split('=')[1] }),
    ).toBe(0);

    expect((await logout(post('/api/auth/logout', undefined, cookie))).status).toBe(204);
    expect((await getMe(cookie)).status).toBe(401);

    const again = await login(
      post('/api/auth/login', { email: 'irfan@example.com', password: account.password }),
    );
    expect(again.status).toBe(200);
    expect((await getMe(sessionCookie(again))).status).toBe(200);
  });

  it('refuses a second account with the same email', async () => {
    const res = await signup(post('/api/auth/signup', { ...account, email: 'irfan@example.com' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_TAKEN');
  });

  // Its own email: the first test's logins already count against irfan@example.com's window.
  it('locks login for an email after 5 attempts in 15 minutes', async () => {
    const attempt = () =>
      login(post('/api/auth/login', { email: 'lockout@example.com', password: 'wrong' }));
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });
});
