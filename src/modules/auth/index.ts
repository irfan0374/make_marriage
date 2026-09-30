import 'server-only';

// Public API of the auth module. Server-rendered pages use `getSession` with the cookie value.
export { getSession, requireSession } from './auth.service';
export { getPageSession } from './session-cookie';
export {
  getMeHandler,
  loginHandler,
  logoutAllHandler,
  logoutHandler,
  signupHandler,
} from './auth.handlers';
export { authCollectionSpecs } from './auth.indexes';
export type { CurrentSession } from './auth.service';
export type { Me, PublicUser } from './auth.types';
