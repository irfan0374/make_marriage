// Wedding website addresses `/w/{slug}` (PRD WEB-1, database-design §7.1). Client-safe.

export const SLUG_MIN = 3;
export const SLUG_MAX = 60;
/** Lowercase letters and numbers in groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Words that would clash with app routes or look official. */
const RESERVED = new Set([
  'about',
  'admin',
  'api',
  'app',
  'gallery',
  'help',
  'invited',
  'join',
  'login',
  'logout',
  'new',
  'privacy',
  'settings',
  'signup',
  'support',
  'terms',
  'w',
  'www',
]);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

/** "Nafiya Begum!" → "nafiya-begum". Accents are dropped; other scripts are removed. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function trimSlug(slug: string, max: number): string {
  return slug.slice(0, max).replace(/-+$/, '');
}

/**
 * The suggested address `{bride}-{groom}-{dd}-{mon}-{yyyy}`, e.g. `nafiya-irfan-14-apr-2028`.
 * Names that slugify to nothing (e.g. written in another script) are left out.
 */
export function suggestSlug(brideName: string, groomName: string, weddingDate: string): string {
  const [year, month, day] = weddingDate.split('-');
  const datePart = `${day}-${MONTHS[Number(month) - 1]}-${year}`;
  // Leave room for the date and a "-NN" suffix if the address is taken.
  const nameRoom = SLUG_MAX - datePart.length - 4;
  const names = trimSlug(
    [slugify(brideName), slugify(groomName)].filter(Boolean).join('-'),
    nameRoom - 1,
  );
  return names ? `${names}-${datePart}` : `wedding-${datePart}`;
}

/** `base-2`, `base-3`, ... kept within the length limit. */
export function slugWithSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  return `${trimSlug(base, SLUG_MAX - suffix.length)}${suffix}`;
}
