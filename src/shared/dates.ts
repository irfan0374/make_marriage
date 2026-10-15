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

/** `date` plus whole months (negative to go back); the 31st becomes the month's last day. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** `date` plus whole days (negative to go back). */
export function addDays(date: string, days: number): string {
  return new Date(utcDay(date) + days * DAY_MS).toISOString().slice(0, 10);
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

/** "14 April 2028", for the wedding website and link previews. */
export function formatFullDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
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

/** "16:00" → "4:00 PM" (12-hour, as Indian families write times). */
export function formatTime(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * The moment a wall-clock `date` and `time` happen in `timeZone`, e.g. 4:00 PM on 12 Apr 2028
 * in Kochi → 10:30 UTC. For calendar files.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h = 0, mi = 0] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // The zone's offset at that moment; checked twice so a daylight-saving change is respected.
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(instant);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return (
      Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - instant
    );
  };
  const first = asUtc - offsetAt(asUtc);
  return new Date(asUtc - offsetAt(first));
}

/** The wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`) of an instant in `timeZone`. */
export function localParts(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

/**
 * The instant a wall-clock `date` and `time` happen in `timeZone`, strictly: `null` if that time
 * doesn't exist there (skipped when clocks go forward, e.g. 01:30 on 26 Mar 2028 in London).
 * When it happens twice (clocks go back), the first one, e.g. 01:30 BST not GMT.
 */
export function localTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h = 0, mi = 0] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (instant: number) => {
    const local = localParts(new Date(instant), timeZone);
    const [ly, lmo, ld] = local.date.split('-').map(Number) as [number, number, number];
    const [lh, lmi] = local.time.split(':').map(Number) as [number, number];
    return Date.UTC(ly, lmo - 1, ld, lh, lmi) - Math.floor(instant / 60000) * 60000;
  };
  // Offsets either side of any change that day; each gives a candidate that must round-trip.
  const HOURS_12 = 12 * 60 * 60 * 1000;
  const candidates = [...new Set([offsetAt(asUtc - HOURS_12), offsetAt(asUtc + HOURS_12)])]
    .map((offset) => asUtc - offset)
    .filter((instant) => {
      const back = localParts(new Date(instant), timeZone);
      return back.date === date && back.time === time;
    })
    .sort((a, b) => a - b);
  return candidates.length > 0 ? new Date(candidates[0]!) : null;
}

/** The hour (0–23) it is now in `timeZone`, e.g. for "9 AM in the wedding's timezone". */
export function hourIn(timeZone: string, now = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(now)
    .find((p) => p.type === 'hour')?.value;
  return Number(hour ?? 0);
}
