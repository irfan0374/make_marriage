// Non-secret limits and defaults. Safe to import from client components.

/** New weddings start in India time (PRD §4); changeable later in Settings. */
export const DEFAULT_WEDDING_TIMEZONE = 'Asia/Kolkata';

/** The main wedding date can be at most this many years ahead when it's set (api-spec §6.1). */
export const MAX_WEDDING_YEARS_AHEAD = 5;

/**
 * Timezones offered when creating a wedding: India plus the places Indian families most often
 * hold weddings abroad. The API accepts any valid IANA timezone; this is only the picker's list.
 * Labels avoid fixed UTC offsets because London and New York change with daylight saving.
 */
export const WEDDING_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Dubai', label: 'Gulf (GST, Dubai)' },
  { value: 'Europe/London', label: 'United Kingdom (London)' },
  { value: 'America/New_York', label: 'US Eastern (New York)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
] as const;

/** Display name for a wedding's timezone, e.g. "India (IST)"; other zones show their IANA id. */
export function timezoneLabel(timezone: string): string {
  return WEDDING_TIMEZONES.find((tz) => tz.value === timezone)?.label ?? timezone;
}

/** Gallery storage cap per wedding: 3 GB (database-design §7.1). */
export const GALLERY_STORAGE_CAP_BYTES = 3 * 1024 * 1024 * 1024;
