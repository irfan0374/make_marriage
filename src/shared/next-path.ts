// Where to go after logging in or signing up, from `?next=`. Client-safe.

/** Pages a `next` may point to: the app and invite links. Anything else goes to `/app`. */
const ALLOWED = [/^\/app(\/[A-Za-z0-9/_-]*)?$/, /^\/join\/[A-Za-z0-9_-]{43}$/];

/**
 * `value` if it's one of our own pages, otherwise `null`. Blocks other sites (`//evil.com`,
 * `https://…`, `/\evil.com`) so a link can't send someone off-site after they log in.
 */
export function safeNextPath(value: string | string[] | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return ALLOWED.some((pattern) => pattern.test(value)) ? value : null;
}

/** `/login` or `/signup` with the `next` (and an email to fill in) kept. */
export function authHref(page: '/login' | '/signup', next: string | null, email?: string | null) {
  const query = new URLSearchParams();
  if (next) query.set('next', next);
  if (email) query.set('email', email);
  const qs = query.toString();
  return qs ? `${page}?${qs}` : page;
}
