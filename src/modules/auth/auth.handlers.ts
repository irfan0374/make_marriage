import 'server-only';
import { created, defineHandler, noContent, ok } from '@/lib/http';
import { loginSchema, signupSchema } from './auth.schemas';
import { getMe, login, logout, logoutAll, signup } from './auth.service';
import {
  clearSessionCookie,
  clientInfo,
  readSessionToken,
  setSessionCookie,
} from './session-cookie';

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

// POST /api/auth/logout-all (api-spec §5.4)
export const logoutAllHandler = defineHandler(
  { route: '/api/auth/logout-all' },
  async ({ request }) => {
    await logoutAll(readSessionToken(request));
    return clearSessionCookie(noContent());
  },
);

// GET /api/me (api-spec §5.7)
export const getMeHandler = defineHandler({ route: '/api/me' }, async ({ request }) => {
  const token = readSessionToken(request);
  const { me, refreshedExpiresAt } = await getMe(token);
  const response = ok(me);
  // The session slid forward: move the cookie's expiry with it.
  return token && refreshedExpiresAt
    ? setSessionCookie(response, token, refreshedExpiresAt)
    : response;
});
