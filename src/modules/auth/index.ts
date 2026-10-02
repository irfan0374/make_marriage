import 'server-only';

// Public API of the auth module. Server-rendered pages use `getSession` with the cookie value.
export { getPageSession, getSession, requireSession } from './auth.service';
export {
  loginHandler,
  logoutAllHandler,
  logoutHandler,
  readSessionToken,
  signupHandler,
} from './auth.handlers';
export { authCollectionSpecs } from './auth.indexes';
export type { CurrentSession } from './auth.service';
export type { PublicUser } from './auth.types';
