import 'server-only';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/config/app';
import { getSession } from './auth.service';

// The session cookie (api-spec §3.1): HttpOnly, SameSite=Lax, Secure outside local dev.

export function readSessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value || undefined;
}

function serialize(value: string, maxAgeSeconds: number): string {
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
  response.headers.append('Set-Cookie', serialize(token, maxAge));
  return response;
}

export function clearSessionCookie(response: Response) {
  response.headers.append('Set-Cookie', serialize('', 0));
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

/** The logged-in session for a server-rendered page, or null. */
export async function getPageSession() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return getSession(token || undefined);
}
