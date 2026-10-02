import { z } from 'zod';
import {
  DEFAULT_WEDDING_TIMEZONE,
  MAX_WEDDING_YEARS_AHEAD,
  WEDDING_TIMEZONES,
} from '@/config/constants';
import { addYears, canonicalTimeZone, isValidTimeZone, todayIn } from '@/shared/dates';

// Client-safe: the create-wedding form validates with this same schema (api-spec §6.1).

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

export const timezoneField = z
  .string()
  .refine(isValidTimeZone, 'Choose a valid timezone')
  .transform((timeZone) =>
    canonicalTimeZone(
      timeZone,
      WEDDING_TIMEZONES.map((tz) => tz.value),
    ),
  )
  .default(DEFAULT_WEDDING_TIMEZONE);

export const createWeddingSchema = z
  .strictObject({
    brideName: personName('bride'),
    groomName: personName('groom'),
    // The main wedding day. Must also be from today to MAX_WEDDING_YEARS_AHEAD years ahead in
    // the chosen timezone (below).
    weddingDate: z.string().min(1, 'Enter the wedding date').pipe(z.iso.date('Enter a valid date')),
    city: z
      .string()
      .trim()
      .min(1, 'Enter the city of your wedding')
      .max(CITY_MAX, `Use at most ${CITY_MAX} characters`),
    // Free text until the Google Places venue search (Phase 4) fills `location`.
    venue: z.string().trim().max(VENUE_MAX, `Use at most ${VENUE_MAX} characters`).default(''),
    timezone: timezoneField,
    sidesEnabled: z.boolean().default(false),
  })
  .check((ctx) => {
    const { weddingDate, timezone } = ctx.value;
    // Only compare once both are valid; their own errors are reported above.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weddingDate) || !isValidTimeZone(timezone)) return;
    const today = todayIn(timezone);
    const message =
      weddingDate < today
        ? 'Pick today or a later date'
        : weddingDate > addYears(today, MAX_WEDDING_YEARS_AHEAD)
          ? `Pick a date within the next ${MAX_WEDDING_YEARS_AHEAD} years`
          : null;
    if (message) {
      ctx.issues.push({ code: 'custom', input: weddingDate, path: ['weddingDate'], message });
    }
  });
