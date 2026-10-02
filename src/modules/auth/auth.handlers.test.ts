import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import * as service from './auth.service';
import { loginHandler, logoutHandler, signupHandler } from './auth.handlers';

vi.mock('./auth.service', () => ({
  signup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
}));

const user = { id: '66f1a2b3c4d5e6f708091011', email: 'irfan@example.com', name: 'Irfan' };
const expiresAt = new Date(Date.now() + 30 * 24 * 3_600_000);

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      ...headers,
    },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/auth/signup', () => {
  it('returns 201 with the user and an HttpOnly, SameSite=Lax session cookie', async () => {
    vi.mocked(service.signup).mockResolvedValueOnce({ user, token: 'raw-token', expiresAt });
    const res = await signupHandler(
      post('/api/auth/signup', {
        name: ' Irfan ',
        email: 'IRFAN@Example.com',
        password: 'correct-horse-42',
      }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { user } });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^mmm_session=raw-token; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax/);
    expect(Number(/Max-Age=(\d+)/.exec(cookie)![1])).toBeGreaterThan(29 * 24 * 3600);
    // Input is normalised before it reaches the service; the client IP is the first hop.
    expect(service.signup).toHaveBeenCalledWith(
      { name: 'Irfan', email: 'irfan@example.com', password: 'correct-horse-42' },
      { ip: '203.0.113.7', userAgent: null },
    );
  });

  it('rejects short passwords and unknown fields with VALIDATION_ERROR', async () => {
    const res = await signupHandler(
      post('/api/auth/signup', {
        name: 'Irfan',
        email: 'irfan@example.com',
        password: 'short',
        role: 'admin',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    expect(service.signup).not.toHaveBeenCalled();
  });

  it('rejects requests from another site', async () => {
    const res = await signupHandler(
      post(
        '/api/auth/signup',
        { name: 'Irfan', email: 'irfan@example.com', password: 'correct-horse-42' },
        { origin: 'https://evil.example' },
      ),
    );
    expect(res.status).toBe(403);
    expect(service.signup).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login', () => {
  it('sets the session cookie on success', async () => {
    vi.mocked(service.login).mockResolvedValueOnce({ user, token: 'raw-token', expiresAt });
    const res = await loginHandler(
      post('/api/auth/login', { email: 'irfan@example.com', password: 'x' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('mmm_session=raw-token');
  });

  it('returns 401 INVALID_CREDENTIALS without setting a cookie', async () => {
    vi.mocked(service.login).mockRejectedValueOnce(new AppError('INVALID_CREDENTIALS'));
    const res = await loginHandler(
      post('/api/auth/login', { email: 'irfan@example.com', password: 'x' }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('passes Retry-After through when rate-limited', async () => {
    vi.mocked(service.login).mockRejectedValueOnce(
      new AppError('RATE_LIMITED', undefined, { headers: { 'Retry-After': '120' } }),
    );
    const res = await loginHandler(
      post('/api/auth/login', { email: 'irfan@example.com', password: 'x' }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('120');
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session and clears the cookie', async () => {
    const res = await logoutHandler(
      post('/api/auth/logout', undefined, { cookie: 'mmm_session=raw-token' }),
    );
    expect(res.status).toBe(204);
    expect(service.logout).toHaveBeenCalledWith('raw-token');
    expect(res.headers.get('set-cookie')).toMatch(/^mmm_session=; Path=\/; Max-Age=0/);
  });
});
