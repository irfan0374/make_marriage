import { z } from 'zod';
import {
  DEFAULT_WEDDING_TIMEZONE,
  MAX_WEDDING_YEARS_AHEAD,
  WEDDING_TIMEZONES,
} from '@/config/constants';
import { addYears, canonicalTimeZone, isValidTimeZone, todayIn } from '@/shared/dates';

// Client-safe: the create-wedding and settings forms validate with these same schemas
// (api-spec §6.1, §6.3).

export const PERSON_NAME_MAX = 60;
export const CITY_MAX = 80;
export const VENUE_MAX = 200;

const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { message: `Enter the ${label}'s name`, abort: true })
    .max(PERSON_NAME_MAX, `Use at most ${PERSON_NAME_MAX} characters`)
    // Any script counts, so names in Malayalam, Hindi or Arabic are fine; "!!!" is not.
    .regex(/\p{L}/u, 'Use at least one letter');

const weddingDateField = z
  .string()
  .min(1, 'Enter the wedding date')
  .pipe(z.iso.date('Enter a valid date'));

const cityField = z
  .string()
  .trim()
  .min(1, 'Enter the city of your wedding')
  .max(CITY_MAX, `Use at most ${CITY_MAX} characters`);

// Free text until the Google Places venue search (Phase 4) fills `location`.
const venueField = z.string().trim().max(VENUE_MAX, `Use at most ${VENUE_MAX} characters`);

const timezoneValue = z
  .string()
  .refine(isValidTimeZone, 'Choose a valid timezone')
  .transform((timeZone) =>
    canonicalTimeZone(
      timeZone,
      WEDDING_TIMEZONES.map((tz) => tz.value),
    ),
  );

export const timezoneField = timezoneValue.default(DEFAULT_WEDDING_TIMEZONE);

/** Both values are well-formed, so `weddingDateProblem` can compare them. */
export function canCheckWeddingDate(date: string, timezone: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && isValidTimeZone(timezone);
}

/**
 * Why a newly set main wedding date isn't allowed, or `null` if it is: it must be from today to
 * MAX_WEDDING_YEARS_AHEAD years ahead in the wedding's timezone. Applies when the date is set or
 * changed, never to a date that's simply kept, so a wedding that has happened can still be edited.
 */
export function weddingDateProblem(
  date: string,
  timezone: string,
  now = new Date(),
): string | null {
  const today = todayIn(timezone, now);
  if (date < today) return 'Pick today or a later date';
  if (date > addYears(today, MAX_WEDDING_YEARS_AHEAD)) {
    return `Pick a date within the next ${MAX_WEDDING_YEARS_AHEAD} years`;
  }
  return null;
}

export const createWeddingSchema = z
  .strictObject({
    brideName: personName('bride'),
    groomName: personName('groom'),
    // The main wedding day; its range is checked below, in the chosen timezone.
    weddingDate: weddingDateField,
    city: cityField,
    venue: venueField.default(''),
    timezone: timezoneField,
    sidesEnabled: z.boolean().default(false),
  })
  .check((ctx) => {
    const { weddingDate, timezone } = ctx.value;
    // Only compare once both are valid; their own errors are reported above.
    if (!canCheckWeddingDate(weddingDate, timezone)) return;
    const message = weddingDateProblem(weddingDate, timezone);
    if (message) {
      ctx.issues.push({ code: 'custom', input: weddingDate, path: ['weddingDate'], message });
    }
  });

/**
 * PATCH /api/weddings/{weddingId} (api-spec §6.3): any subset of the details, with the same rules
 * as creating. The date range depends on the saved date and timezone, so the service checks it.
 */
export const updateWeddingSchema = z.strictObject({
  brideName: personName('bride').optional(),
  groomName: personName('groom').optional(),
  weddingDate: weddingDateField.optional(),
  city: cityField.optional(),
  venue: venueField.optional(),
  timezone: timezoneValue.optional(),
  sidesEnabled: z.boolean().optional(),
});
