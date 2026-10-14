import { z } from 'zod';
import { objectIdString } from '@/shared/validation';

// Client-safe: the Add family modal, filters and bulk bar validate with these same schemas
// (api-spec §9, database-design §7.5).

export const DISPLAY_NAME_MAX = 100;
export const MEMBER_NAME_MAX = 80;
export const MAX_MEMBERS = 30;
export const HEADCOUNT_MAX = 50;
export const NOTES_MAX = 1000;
export const TAG_MAX = 30;
export const MAX_TAGS_PER_HOUSEHOLD = 20;
export const MAX_BULK = 500;

export const householdSideSchema = z.enum(['bride', 'groom']);

const displayNameField = z
  .string()
  .trim()
  .min(1, { message: 'Enter a name for this family', abort: true })
  .max(DISPLAY_NAME_MAX, `Use at most ${DISPLAY_NAME_MAX} characters`);

/** Members: blank rows are dropped, so the modal can keep an empty "next member" input. */
const membersField = z
  .array(
    z.strictObject({
      name: z.string().trim().max(MEMBER_NAME_MAX, `Use at most ${MEMBER_NAME_MAX} characters`),
    }),
  )
  .max(MAX_MEMBERS, `Add at most ${MAX_MEMBERS} members`)
  .transform((members) => members.filter((m) => m.name !== ''));

const headcountField = z
  .number({ message: 'Enter how many people' })
  .int('Use a whole number')
  .min(1, 'At least 1 person')
  .max(HEADCOUNT_MAX, `At most ${HEADCOUNT_MAX} people`);

/** Empty means none; otherwise lowercased. */
const emailField = z
  .union([
    z.literal(''),
    z.null(),
    z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  ])
  .transform((value) => (value ? value : null));

/**
 * Phone: spaces, dashes, dots and brackets are ignored; 7–15 digits with an optional leading +.
 * A 10-digit number without + is taken as Indian (+91).
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d{7,15}$/.test(compact)) return null;
  if (compact.startsWith('+')) return compact;
  return compact.length === 10 ? `+91${compact}` : `+${compact}`;
}

const phoneField = z.union([z.literal(''), z.null(), z.string().trim()]).transform((value, ctx) => {
  if (!value) return null;
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.issues.push({
      code: 'custom',
      input: value,
      message: 'Enter a phone number like +91 98765 43210',
    });
    return z.NEVER;
  }
  return phone;
});

export const tagField = z
  .string()
  .trim()
  .min(1, 'Tags can’t be empty')
  .max(TAG_MAX, `Keep tags under ${TAG_MAX} characters`);

const tagsField = z
  .array(tagField)
  .max(MAX_TAGS_PER_HOUSEHOLD, `Use at most ${MAX_TAGS_PER_HOUSEHOLD} tags`)
  .transform((tags) => [...new Map(tags.map((t) => [t.toLowerCase(), t])).values()]);

const notesField = z.string().trim().max(NOTES_MAX, `Use at most ${NOTES_MAX} characters`);

const invitedEventsField = z
  .array(
    z.strictObject({
      eventId: objectIdString.transform((id) => id.toLowerCase()),
      /** Defaults to the family's headcount. */
      headcount: headcountField.optional(),
    }),
  )
  .max(50)
  .refine((events) => new Set(events.map((e) => e.eventId)).size === events.length, {
    message: 'Each event can appear only once',
  });

// POST /api/weddings/{weddingId}/households (api-spec §9.2).
export const createHouseholdSchema = z.strictObject({
  displayName: displayNameField,
  members: membersField.default([]),
  /** Defaults to the number of members, or 1. */
  headcount: headcountField.optional(),
  email: emailField.default(null),
  phone: phoneField.default(null),
  /** Required when the wedding has sides turned on; checked in the service. */
  side: householdSideSchema.nullable().default(null),
  tags: tagsField.default([]),
  notes: notesField.default(''),
  invitedEvents: invitedEventsField.default([]),
});

// PATCH /api/weddings/{weddingId}/households/{householdId} (api-spec §9.4): any subset.
export const updateHouseholdSchema = z
  .strictObject({
    displayName: displayNameField.optional(),
    members: membersField.optional(),
    headcount: headcountField.optional(),
    email: emailField.optional(),
    phone: phoneField.optional(),
    side: householdSideSchema.nullable().optional(),
    tags: tagsField.optional(),
    notes: notesField.optional(),
    invitedEvents: invitedEventsField.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field' });

const commaList = <T extends z.ZodType<string>>(item: T, message: string) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      const parsed = z.array(item).safeParse(value.split(','));
      if (!parsed.success) {
        ctx.issues.push({ code: 'custom', input: value, message });
        return z.NEVER;
      }
      return parsed.data as z.output<T>[];
    });

// GET /api/weddings/{weddingId}/households (api-spec §9.1).
export const listHouseholdsQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  side: householdSideSchema.optional(),
  tags: commaList(tagField, 'Unknown tag'),
  eventId: objectIdString.optional(),
  inviteStatus: commaList(
    z.enum(['not_sent', 'queued', 'sent', 'sent_manually', 'failed']),
    'Unknown invite status',
  ),
  responseStatus: z.enum(['none', 'partial', 'complete']).optional(),
  /** Families whose email bounced (Resend webhook). */
  emailBounced: z.literal('true').optional(),
  sort: z.enum(['name', '-createdAt', '-updatedAt']).default('name'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .regex(/^\d{1,5}$/, 'Invalid cursor')
    .optional(),
});

// GET /api/weddings/{weddingId}/households/duplicates (api-spec §9.14).
export const duplicatesQuerySchema = z.strictObject({
  displayName: z.string().trim().max(DISPLAY_NAME_MAX).optional(),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(30).optional(),
  excludeId: objectIdString.optional(),
});

// POST /api/weddings/{weddingId}/households/bulk (api-spec §9.8).
export const bulkHouseholdsSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.enum(['assign_events', 'remove_events']),
    householdIds: z.array(objectIdString).min(1).max(MAX_BULK),
    eventIds: z.array(objectIdString).min(1, 'Choose at least one event').max(50),
  }),
  z.strictObject({
    action: z.enum(['add_tags', 'remove_tags']),
    householdIds: z.array(objectIdString).min(1).max(MAX_BULK),
    tags: z.array(tagField).min(1, 'Choose at least one tag').max(MAX_TAGS_PER_HOUSEHOLD),
  }),
  z.strictObject({
    action: z.literal('delete'),
    householdIds: z.array(objectIdString).min(1).max(MAX_BULK),
  }),
]);

// Imports deliberately validate individual rows in the service, allowing partial success.
export const importHouseholdsSchema = z.strictObject({
  rows: z
    .array(z.unknown())
    .min(1, 'Choose at least one family')
    .max(1000, 'Import at most 1,000 rows at a time'),
  createMissingTags: z.boolean().default(true),
  dryRun: z.boolean().default(true),
});

export const importHouseholdRowSchema = createHouseholdSchema
  .omit({ members: true, invitedEvents: true })
  .extend({
    members: z.array(z.string().trim().max(MEMBER_NAME_MAX)).max(MAX_MEMBERS).default([]),
    eventIds: z.array(objectIdString).max(50).default([]),
  })
  .transform(({ members, eventIds, ...rest }): z.input<typeof createHouseholdSchema> => ({
    ...rest,
    members: members.map((name) => ({ name })),
    invitedEvents: eventIds.map((eventId) => ({ eventId })),
  }))
  .pipe(createHouseholdSchema);

// RSVPs (api-spec §9.12, §11.2; database-design §7.5).
export const RSVP_NOTE_MAX = 500;

const rsvpStatusField = z.enum(['attending', 'declined'], {
  message: 'Choose Attending or Not attending',
});

const rsvpNoteField = z
  .string()
  .trim()
  .max(RSVP_NOTE_MAX, `Use at most ${RSVP_NOTE_MAX} characters`);

/**
 * One reply. Attending needs 1 or more people (the upper limit, the family's invited number
 * for that event, is checked in the service); declining always means 0.
 */
const rsvpReplyShape = {
  status: rsvpStatusField,
  attendingCount: z
    .number({ message: 'Enter how many people are coming' })
    .int('Use a whole number')
    .min(0)
    .max(HEADCOUNT_MAX)
    .optional(),
  note: rsvpNoteField.default(''),
};

function attendingNeedsPeople(
  value: { status: 'attending' | 'declined'; attendingCount?: number },
  ctx: z.core.$RefinementCtx,
) {
  if (value.status === 'attending' && !value.attendingCount) {
    ctx.addIssue({
      code: 'custom',
      path: ['attendingCount'],
      message: 'Choose how many people are coming',
    });
  }
}

const withCount = <T extends { status: 'attending' | 'declined'; attendingCount?: number }>(
  value: T,
) => ({ ...value, attendingCount: value.status === 'declined' ? 0 : (value.attendingCount ?? 0) });

// PUT /api/weddings/{weddingId}/households/{householdId}/rsvps/{eventId} (api-spec §9.12).
export const hostRsvpSchema = z
  .strictObject(rsvpReplyShape)
  .superRefine(attendingNeedsPeople)
  .transform(withCount);

// PUT /api/public/invitations/{token}/rsvp (api-spec §11.2).
export const guestRsvpSchema = z.strictObject({
  responses: z
    .array(
      z
        .strictObject({
          eventId: objectIdString.transform((id) => id.toLowerCase()),
          ...rsvpReplyShape,
        })
        .superRefine(attendingNeedsPeople)
        .transform(withCount),
    )
    .min(1, 'Answer at least one event')
    .max(50)
    .refine((list) => new Set(list.map((r) => r.eventId)).size === list.length, {
      message: 'Each event can appear only once',
    }),
});
