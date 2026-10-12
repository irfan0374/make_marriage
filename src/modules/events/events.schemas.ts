import { z } from 'zod';
import { MAX_EVENTS_PER_WEDDING } from '@/config/constants';
import { objectIdString } from '@/shared/validation';

// Client-safe: the event panel and Quick add validate with these same schemas (api-spec §8,
// database-design §7.4).

export const EVENT_NAME_MAX = 60;
export const VENUE_NAME_MAX = 120;
export const ADDRESS_MAX = 300;
export const DRESS_CODE_MAX = 120;
export const NOTES_MAX = 1000;
export const MAP_URL_MAX = 2000;

/** Quick-add presets, in the order a wedding usually runs (PRD SETUP-2). */
export const EVENT_PRESETS = [
  { key: 'engagement', name: 'Engagement' },
  { key: 'mehendi', name: 'Mehendi' },
  { key: 'haldi', name: 'Haldi' },
  { key: 'sangeet', name: 'Sangeet' },
  { key: 'wedding', name: 'Wedding' },
  { key: 'reception', name: 'Reception' },
] as const;

export type PresetKey = (typeof EVENT_PRESETS)[number]['key'];
export const presetKeySchema = z.enum(
  EVENT_PRESETS.map((p) => p.key) as [PresetKey, ...PresetKey[]],
);
export const eventPresetKeySchema = z.enum([...presetKeySchema.options, 'custom']);

export function presetName(key: PresetKey): string {
  return EVENT_PRESETS.find((p) => p.key === key)!.name;
}

const nameField = z
  .string()
  .trim()
  .min(1, { message: 'Enter a name for this event', abort: true })
  .max(EVENT_NAME_MAX, `Use at most ${EVENT_NAME_MAX} characters`);

const dateField = z
  .string()
  .min(1, 'Choose a date for this event')
  .pipe(z.iso.date('Enter a valid date'));

const timeValue = z.iso.time({ precision: -1, message: 'Enter a time like 18:30' });

const startTimeField = z.string().min(1, 'Choose a start time').pipe(timeValue);

/** Optional texts: trimmed, `""` when left empty. */
const text = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`);

/** Empty means "no end time"; `null` clears it on an update. */
const endTimeField = z
  .union([z.literal(''), z.null(), timeValue])
  .transform((value) => (value ? value : null));

const mapUrlField = z
  .union([
    z.literal(''),
    z.null(),
    z
      .string()
      .trim()
      .max(MAP_URL_MAX, 'This link is too long')
      .pipe(z.url({ protocol: /^https$/, message: 'Paste a link that starts with https://' })),
  ])
  .transform((value) => (value ? value : null));

/** Same start and end time is almost certainly a typo; earlier means it runs past midnight. */
export function endTimeProblem(startTime: string, endTime: string | null): string | null {
  return endTime !== null && endTime === startTime
    ? "The end time can't be the same as the start time"
    : null;
}

const eventFields = {
  name: nameField,
  presetKey: eventPresetKeySchema.default('custom'),
  date: dateField,
  startTime: startTimeField,
  endTime: endTimeField.default(null),
  venueName: text(VENUE_NAME_MAX).default(''),
  address: text(ADDRESS_MAX).default(''),
  mapUrl: mapUrlField.default(null),
  dressCode: text(DRESS_CODE_MAX).default(''),
  notes: text(NOTES_MAX).default(''),
  showOnWebsite: z.boolean().default(true),
};

// POST /api/weddings/{weddingId}/events (api-spec §8.2).
export const createEventSchema = z.strictObject(eventFields).check((ctx) => {
  const { startTime, endTime } = ctx.value;
  const message = endTimeProblem(startTime, endTime);
  if (message) ctx.issues.push({ code: 'custom', input: endTime, path: ['endTime'], message });
});

// PATCH /api/weddings/{weddingId}/events/{eventId} (api-spec §8.4): any subset. The end time is
// compared with the saved start time in the service when only one of them changes.
export const updateEventSchema = z
  .strictObject({
    name: nameField.optional(),
    presetKey: eventPresetKeySchema.optional(),
    date: dateField.optional(),
    startTime: startTimeField.optional(),
    endTime: endTimeField.optional(),
    venueName: text(VENUE_NAME_MAX).optional(),
    address: text(ADDRESS_MAX).optional(),
    mapUrl: mapUrlField.optional(),
    dressCode: text(DRESS_CODE_MAX).optional(),
    notes: text(NOTES_MAX).optional(),
    showOnWebsite: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field' });

// POST /api/weddings/{weddingId}/events/presets (api-spec §8.3).
export const addPresetEventsSchema = z.strictObject({
  events: z
    .array(
      z.strictObject({
        presetKey: presetKeySchema,
        date: dateField,
        startTime: startTimeField,
      }),
    )
    .min(1, 'Choose at least one event')
    .max(EVENT_PRESETS.length, `Choose at most ${EVENT_PRESETS.length} events`),
});

// POST /api/weddings/{weddingId}/events/reorder (api-spec §8.6).
export const reorderEventsSchema = z.strictObject({
  eventIds: z
    .array(objectIdString)
    .min(1)
    .max(MAX_EVENTS_PER_WEDDING)
    .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, {
      message: 'Each event can appear only once',
    }),
});

// DELETE /api/weddings/{weddingId}/events/{eventId}?confirm=true (api-spec §8.5).
export const deleteEventQuerySchema = z.strictObject({
  confirm: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
