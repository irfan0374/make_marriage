import { z } from 'zod';
import { objectIdString } from '@/shared/validation';

// Client-safe: the expense panel, filters and Settings validate with these same schemas
// (api-spec §13, database-design §7.7). Amounts are integer paise (CLAUDE.md).

export const DESCRIPTION_MAX = 200;
export const EXPENSE_NOTES_MAX = 1000;
export const PAYER_NAME_MAX = 80;
export const CATEGORY_NAME_MAX = 40;
export const MAX_CUSTOM_CATEGORIES = 30;
/** ₹1 billion in paise. */
export const MAX_EXPENSE_PAISE = 100_000_000_000;

export const PRESET_CATEGORIES = [
  'venue',
  'catering',
  'decor',
  'photography_video',
  'attire',
  'jewellery',
  'makeup_beauty',
  'invitations',
  'entertainment',
  'transport',
  'gifts',
  'miscellaneous',
] as const;

export const PRESET_CATEGORY_LABELS: Record<(typeof PRESET_CATEGORIES)[number], string> = {
  venue: 'Venue',
  catering: 'Catering',
  decor: 'Decor',
  photography_video: 'Photography & video',
  attire: 'Attire',
  jewellery: 'Jewellery',
  makeup_beauty: 'Makeup & beauty',
  invitations: 'Invitations',
  entertainment: 'Entertainment',
  transport: 'Transport',
  gifts: 'Gifts',
  miscellaneous: 'Miscellaneous',
};

/** A category's name to show: the preset's label, or the custom category itself. */
export function categoryLabel(category: string): string {
  return PRESET_CATEGORY_LABELS[category as keyof typeof PRESET_CATEGORY_LABELS] ?? category;
}

const amountField = z
  .number({ message: 'Enter the amount' })
  .int('Use a whole number of paise')
  .min(100, 'Enter at least ₹1')
  .max(MAX_EXPENSE_PAISE, 'That amount is too large');

const dateField = z.string().min(1, 'Choose the date').pipe(z.iso.date('Enter a valid date'));

/** Checked against the wedding's custom categories in the service. */
const categoryField = z.string().trim().min(1, 'Choose a category').max(CATEGORY_NAME_MAX);

const descriptionField = z
  .string()
  .trim()
  .min(1, { message: 'Describe what this was for', abort: true })
  .max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters`);

const notesField = z
  .string()
  .trim()
  .max(EXPENSE_NOTES_MAX, `Use at most ${EXPENSE_NOTES_MAX} characters`);

const optionalId = z
  .union([z.literal(''), z.null(), objectIdString])
  .transform((value) => (value ? value.toLowerCase() : null));

/** A team member, or someone named by hand ("Papa"). */
export const paidBySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('member'), userId: objectIdString }),
  z.strictObject({
    type: z.literal('name'),
    name: z
      .string()
      .trim()
      .min(1, 'Enter who paid')
      .max(PAYER_NAME_MAX, `Use at most ${PAYER_NAME_MAX} characters`),
  }),
]);

const receiptField = z
  .strictObject({
    key: z.string().trim().min(1).max(300),
    fileName: z.string().trim().min(1).max(200),
  })
  .nullable();

// POST /api/weddings/{weddingId}/expenses (api-spec §13.2).
export const createExpenseSchema = z.strictObject({
  amountPaise: amountField,
  date: dateField,
  category: categoryField,
  description: descriptionField,
  eventId: optionalId.default(null),
  vendorId: optionalId.default(null),
  paidBy: paidBySchema,
  notes: notesField.default(''),
  receipt: receiptField.default(null),
});

// PATCH /api/weddings/{weddingId}/expenses/{expenseId} (api-spec §13.3): any subset;
// `receipt: null` removes the receipt.
export const updateExpenseSchema = z
  .strictObject({
    amountPaise: amountField.optional(),
    date: dateField.optional(),
    category: categoryField.optional(),
    description: descriptionField.optional(),
    eventId: optionalId.optional(),
    vendorId: optionalId.optional(),
    paidBy: paidBySchema.optional(),
    notes: notesField.optional(),
    receipt: receiptField.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field' });

const dateParam = z.iso.date('Use YYYY-MM-DD').optional();

// GET /api/weddings/{weddingId}/expenses (api-spec §13.1) and the CSV export (§13.6).
export const listExpensesQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  /** Comma-separated categories. */
  category: z
    .string()
    .max(500)
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
        : undefined,
    ),
  /** An event id, or `general` for expenses with no event. */
  eventId: z.union([z.literal('general'), objectIdString]).optional(),
  vendorId: objectIdString.optional(),
  /** The payer's name, as shown. */
  paidBy: z.string().trim().max(PAYER_NAME_MAX).optional(),
  from: dateParam,
  to: dateParam,
  sort: z.enum(['-date', 'date', '-amountPaise']).default('-date'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .regex(/^\d{1,5}$/, 'Invalid cursor')
    .optional(),
});

// GET /api/weddings/{weddingId}/expenses/summary (api-spec §13.5).
export const summaryQuerySchema = z.strictObject({ from: dateParam, to: dateParam });

// PUT /api/weddings/{weddingId}/expense-categories (api-spec §13.7): Admins only.
export const expenseCategoriesSchema = z.strictObject({
  categories: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'A category needs a name')
        .max(CATEGORY_NAME_MAX, `Keep categories under ${CATEGORY_NAME_MAX} characters`),
    )
    .max(MAX_CUSTOM_CATEGORIES, `At most ${MAX_CUSTOM_CATEGORIES} custom categories`)
    .refine(
      (list) => new Set(list.map((c) => c.toLowerCase())).size === list.length,
      'Each category can appear only once',
    )
    .refine(
      (list) =>
        list.every(
          (c) =>
            !(PRESET_CATEGORIES as readonly string[]).includes(c) &&
            !Object.values(PRESET_CATEGORY_LABELS).some((l) => l.toLowerCase() === c.toLowerCase()),
        ),
      'That category already exists in the list',
    ),
});
