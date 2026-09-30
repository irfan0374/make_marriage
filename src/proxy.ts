import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/config/app';

// Fast redirect for the private app (architecture §4.5): no session cookie, no /app.
// Only checks that the cookie exists; pages and the API still validate the session itself.
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/app', '/app/:path*'],
};
