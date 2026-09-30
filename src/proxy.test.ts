import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

describe('proxy (/app gate)', () => {
  it('redirects to /login without a session cookie', () => {
    const res = proxy(new NextRequest('http://localhost/app'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });

  it('lets the request through and slides the cookie 30 days forward', () => {
    const res = proxy(
      new NextRequest('http://localhost/app', { headers: { cookie: 'mmm_session=raw-token' } }),
    );
    expect(res.headers.get('location')).toBeNull();
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('mmm_session=raw-token');
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });
});
