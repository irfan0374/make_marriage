import { z } from 'zod';
import { objectIdString } from '@/shared/validation';

// Client-safe: the invitation setup form validates with this same schema (api-spec §10.2).

export const INVITATION_MESSAGE_MAX = 2000;

// PUT /api/weddings/{weddingId}/invitation (api-spec §10.2). Every field is optional and an
// omitted one keeps its saved value, so the settings form never re-sends the card and changing
// the card never overwrites the text. The deadline's upper limit (the last event) depends on the
// events, so the service checks it.
export const updateInvitationSchema = z
  .strictObject({
    /** From the upload flow (api-spec §15); `null` removes the card. */
    mediaKey: z.string().trim().min(1).max(300).nullable().optional(),
    message: z
      .string()
      .trim()
      .max(INVITATION_MESSAGE_MAX, `Use at most ${INVITATION_MESSAGE_MAX} characters`)
      .optional(),
    rsvpDeadline: z
      .union([z.literal(''), z.null(), z.iso.date('Enter a valid date')])
      .transform((value) => value || null)
      .optional(),
    autoRemindersEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one setting' });

const MAX_SELECTED = 500;
const selectedFamilies = z
  .array(objectIdString)
  .min(1, 'Choose at least one family')
  .max(MAX_SELECTED, `Choose at most ${MAX_SELECTED} families at a time`);

// POST /api/weddings/{weddingId}/invitation/send (api-spec §10.4). `dryRun` only counts.
export const sendInvitationsSchema = z.union([
  z.strictObject({
    householdIds: selectedFamilies,
    /** Include families already sent an email (or shared by hand). */
    resend: z.boolean().default(false),
    dryRun: z.boolean().default(false),
  }),
  z.strictObject({ filter: z.literal('all_not_sent'), dryRun: z.boolean().default(false) }),
]);

// POST /api/weddings/{weddingId}/invitation/remind (api-spec §10.7).
export const remindFamiliesSchema = z.union([
  z.strictObject({ householdIds: selectedFamilies, dryRun: z.boolean().default(false) }),
  z.strictObject({ filter: z.literal('all_incomplete'), dryRun: z.boolean().default(false) }),
]);

// POST /api/weddings/{weddingId}/events/{eventId}/notify-change (api-spec §10.8).
export const notifyChangeSchema = z.strictObject({ dryRun: z.boolean().default(false) });

/** A batch id in a URL: `send_…`, `remind_…` or `update_…`. */
export const batchIdSchema = z.string().regex(/^(send|remind|update)_[a-z0-9_]{6,60}$/);
