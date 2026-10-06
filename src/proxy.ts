import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/config/app';

// Private app gate (architecture §4.5). Only checks that the session cookie exists; pages and
// the API still validate the session itself.
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    // Come back to this page after logging in.
    const login = new URL('/login', request.url);
    login.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  // Sessions extend while active: every app page load pushes the cookie's expiry 30 days out.
  // The database session slides in step (at most once a day) when the page reads it.
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ['/app', '/app/:path*'],
};
