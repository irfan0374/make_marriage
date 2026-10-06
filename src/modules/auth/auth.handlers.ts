import 'server-only';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/config/app';
import { created, defineHandler, noContent, ok } from '@/lib/http';
import { loginSchema, signupSchema } from './auth.schemas';
import { login, logout, signup } from './auth.service';

// The session cookie (api-spec §3.1): HttpOnly, SameSite=Lax, Secure outside local dev.

export function readSessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value || undefined;
}

function serializeCookie(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  // Safari drops Secure cookies on http://localhost, so dev runs without it.
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function setSessionCookie(
  response: Response,
  token: string,
  expiresAt: Date,
  now = new Date(),
) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  response.headers.append('Set-Cookie', serializeCookie(token, maxAge));
  return response;
}

export function clearSessionCookie(response: Response) {
  response.headers.append('Set-Cookie', serializeCookie('', 0));
  return response;
}

export function clientInfo(request: NextRequest) {
  // Vercel puts the real client address first in x-forwarded-for.
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ip: forwarded || request.headers.get('x-real-ip') || 'unknown',
    userAgent: request.headers.get('user-agent'),
  };
}

// POST /api/auth/signup (api-spec §5.1)
export const signupHandler = defineHandler(
  { route: '/api/auth/signup', body: signupSchema },
  async ({ request, body }) => {
    const session = await signup(body, clientInfo(request));
    return setSessionCookie(created({ user: session.user }), session.token, session.expiresAt);
  },
);

// POST /api/auth/login (api-spec §5.2)
export const loginHandler = defineHandler(
  { route: '/api/auth/login', body: loginSchema },
  async ({ request, body }) => {
    const session = await login(body, clientInfo(request));
    return setSessionCookie(ok({ user: session.user }), session.token, session.expiresAt);
  },
);

// POST /api/auth/logout (api-spec §5.3). Clears the cookie even if the session was already gone.
export const logoutHandler = defineHandler({ route: '/api/auth/logout' }, async ({ request }) => {
  await logout(readSessionToken(request));
  return clearSessionCookie(noContent());
});
