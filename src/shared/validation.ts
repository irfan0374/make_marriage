import { z } from 'zod';

// Shared Zod primitives. Client-safe: no server imports (no `mongodb`, no env).

/** 24-character hex MongoDB id as sent over the API. Convert with `toObjectId` on the server. */
export const objectIdString = z.string().regex(/^[a-f0-9]{24}$/i, 'Must be a valid id');

/** Calendar date `YYYY-MM-DD` in the wedding's timezone. */
export const calendarDate = z.iso.date();

/** Clock time `HH:mm`, 24-hour. */
export const clockTime = z.iso.time({ precision: -1 });

/** Money in integer paise, ₹0.01 to ₹1 billion. */
export const amountPaise = z.number().int().min(1).max(100_000_000_000);

/** Cursor pagination query (api-spec §2.5). Merge into a list endpoint's query schema. */
export const paginationQuery = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
};
