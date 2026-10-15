import { z } from 'zod';
import { normalizePhone } from '@/modules/households/households.schemas';
import { objectIdString } from '@/shared/validation';

// Client-safe: the Add / Edit vendor modal and the filters validate with these same schemas
// (api-spec §14, database-design §7.8).

export const VENDOR_NAME_MAX = 120;
export const CONTACT_MAX = 80;
export const VENDOR_NOTES_MAX = 2000;
export const MAX_ATTACHMENTS = 10;
/** ₹1 billion in paise, the same ceiling as an expense. */
export const MAX_AMOUNT_PAISE = 100_000_000_000;

export const VENDOR_CATEGORIES = [
  'venue',
  'caterer',
  'photographer',
  'videographer',
  'decorator',
  'makeup_artist',
  'mehendi_artist',
  'dj_music',
  'florist',
  'transport',
  'priest_officiant',
  'other',
] as const;

export const VENDOR_CATEGORY_LABELS: Record<(typeof VENDOR_CATEGORIES)[number], string> = {
  venue: 'Venue',
  caterer: 'Caterer',
  photographer: 'Photographer',
  videographer: 'Videographer',
  decorator: 'Decorator',
  makeup_artist: 'Makeup artist',
  mehendi_artist: 'Mehendi artist',
  dj_music: 'DJ & music',
  florist: 'Florist',
  transport: 'Transport',
  priest_officiant: 'Priest / officiant',
  other: 'Other',
};

export const VENDOR_STATUSES = ['shortlisted', 'booked', 'completed'] as const;

export const VENDOR_STATUS_LABELS: Record<(typeof VENDOR_STATUSES)[number], string> = {
  shortlisted: 'Shortlisted',
  booked: 'Booked',
  completed: 'Completed',
};

export const vendorCategorySchema = z.enum(VENDOR_CATEGORIES, { message: 'Choose a category' });
export const vendorStatusSchema = z.enum(VENDOR_STATUSES);

const nameField = z
  .string()
  .trim()
  .min(1, { message: 'Enter the vendor’s name', abort: true })
  .max(VENDOR_NAME_MAX, `Use at most ${VENDOR_NAME_MAX} characters`);

const shortText = z.string().trim().max(CONTACT_MAX, `Use at most ${CONTACT_MAX} characters`);

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

const emailField = z
  .union([
    z.literal(''),
    z.null(),
    z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  ])
  .transform((value) => (value ? value : null));

/** In paise, like every amount (CLAUDE.md); the form takes rupees. */
const contractField = z
  .number({ message: 'Enter an amount in rupees' })
  .int('Use a whole number')
  .min(0, 'Use 0 or more')
  .max(MAX_AMOUNT_PAISE, 'That amount is too large')
  .nullable();

const eventIdsField = z
  .array(objectIdString.transform((id) => id.toLowerCase()))
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Each event can appear only once',
  });

// POST /api/weddings/{weddingId}/vendors (api-spec §14.2).
export const createVendorSchema = z.strictObject({
  name: nameField,
  category: vendorCategorySchema,
  contactName: shortText.default(''),
  contactRole: shortText.default(''),
  phone: phoneField.default(null),
  whatsapp: phoneField.default(null),
  email: emailField.default(null),
  notes: z
    .string()
    .trim()
    .max(VENDOR_NOTES_MAX, `Use at most ${VENDOR_NOTES_MAX} characters`)
    .default(''),
  status: vendorStatusSchema.default('shortlisted'),
  eventIds: eventIdsField.default([]),
  /** The agreed price, in paise; `null` when not known yet. */
  contractAmountPaise: contractField.default(null),
});

// PATCH /api/weddings/{weddingId}/vendors/{vendorId} (api-spec §14.4): any subset.
export const updateVendorSchema = z
  .strictObject({
    name: nameField.optional(),
    category: vendorCategorySchema.optional(),
    contactName: shortText.optional(),
    contactRole: shortText.optional(),
    phone: phoneField.optional(),
    whatsapp: phoneField.optional(),
    email: emailField.optional(),
    notes: z
      .string()
      .trim()
      .max(VENDOR_NOTES_MAX, `Use at most ${VENDOR_NOTES_MAX} characters`)
      .optional(),
    status: vendorStatusSchema.optional(),
    eventIds: eventIdsField.optional(),
    contractAmountPaise: contractField.optional(),
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

// GET /api/weddings/{weddingId}/vendors (api-spec §14.1).
export const listVendorsQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  category: commaList(vendorCategorySchema, 'Unknown category'),
  status: commaList(vendorStatusSchema, 'Unknown status'),
  eventId: objectIdString.optional(),
  sort: z.enum(['name', '-createdAt']).default('name'),
});

// POST /api/weddings/{weddingId}/vendors/{vendorId}/attachments (api-spec §14.6).
export const addAttachmentSchema = z.strictObject({
  key: z.string().trim().min(1).max(300),
  fileName: z.string().trim().min(1).max(200),
});
