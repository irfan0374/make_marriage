// Calendar dates (`YYYY-MM-DD`) in a wedding's timezone. Client-safe.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether `timeZone` is an IANA timezone this runtime knows, e.g. `Asia/Kolkata`. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The standard spelling of a valid timezone, e.g. `asia/kolkata` → `Asia/Kolkata`, so the same
 * zone is always stored and shown the same way. `preferred` names win (the runtime's own list
 * still uses some old names, like `Asia/Calcutta`); unknown spellings are returned unchanged.
 */
export function canonicalTimeZone(timeZone: string, preferred: readonly string[] = []): string {
  const lower = timeZone.toLowerCase();
  const known = [...preferred, ...Intl.supportedValuesOf('timeZone')];
  return known.find((zone) => zone.toLowerCase() === lower) ?? timeZone;
}

/** Today's calendar date in `timeZone`, as `YYYY-MM-DD`. */
export function todayIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Midnight UTC of a `YYYY-MM-DD` date: a stable point for whole-day maths and formatting. */
function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** `date` plus whole years; 29 Feb becomes 28 Feb in a non-leap year. */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y + years, m - 1, 1));
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Whole days from today (in `timeZone`) until `date`: 0 on the day, negative once it has passed. */
export function daysUntil(date: string, timeZone: string, now = new Date()): number {
  return Math.round((utcDay(date) - utcDay(todayIn(timeZone, now))) / DAY_MS);
}

/** "14 Apr 2028" (architecture §18.4). */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDay(date));
}

/** "Friday, 14 Apr 2028". */
export function formatLongDate(date: string): string {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    utcDay(date),
  );
  return `${weekday}, ${formatDate(date)}`;
}
