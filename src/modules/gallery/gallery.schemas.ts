import { z } from 'zod';
import { objectIdString } from '@/shared/validation';

// Client-safe: the guest page and the couple's gallery check with these same rules
// (api-spec §19, PRD §5.10).

/** Photos are resized in the browser to WebP, or JPEG where the browser can't make WebP. */
export const PHOTO_TYPES = ['image/webp', 'image/jpeg'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export const MAX_FILES_PER_REQUEST = 50;
export const MAX_DISPLAY_BYTES = 2 * 1024 * 1024;
export const MAX_THUMB_BYTES = 200 * 1024;
/** Longest side of the display copy and of the thumbnail, in pixels (PRD GAL-3). */
export const DISPLAY_EDGE = 2000;
export const THUMB_EDGE = 480;
export const MAX_PHOTOS_PER_WEDDING = 5000;
export const MAX_BULK_PHOTOS = 200;
export const MAX_UPLOADER_NAME = 60;
/** Photos per ZIP part (PRD GAL-8). */
export const ZIP_PART_SIZE = 500;

/** An album filter: an event id, or `general` for photos without an event. */
const albumFilter = z.union([z.literal('general'), objectIdString]);

const limit = z.coerce.number().int().min(1).max(100).default(60);

export const updateGallerySchema = z
  .strictObject({ uploadsOpen: z.boolean().optional(), guestViewing: z.boolean().optional() })
  .refine((v) => v.uploadsOpen !== undefined || v.guestViewing !== undefined, {
    message: 'Nothing to change',
  });

export const qrQuerySchema = z.strictObject({ format: z.enum(['png', 'svg']).default('png') });

export const listPhotosQuerySchema = z.strictObject({
  album: albumFilter.optional(),
  hidden: z.enum(['true', 'false']).optional(),
  limit,
  cursor: objectIdString.optional(),
});

export const publicPhotosQuerySchema = z.strictObject({
  album: albumFilter.optional(),
  limit,
  cursor: objectIdString.optional(),
});

export const updatePhotoSchema = z
  .strictObject({
    hidden: z.boolean().optional(),
    /** `null` moves the photo to "General". */
    albumEventId: objectIdString.nullable().optional(),
  })
  .refine((v) => v.hidden !== undefined || v.albumEventId !== undefined, {
    message: 'Nothing to change',
  });

export const bulkPhotosSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.enum(['hide', 'unhide', 'delete']),
    photoIds: z.array(objectIdString).min(1).max(MAX_BULK_PHOTOS),
  }),
  z.strictObject({
    action: z.literal('move'),
    photoIds: z.array(objectIdString).min(1).max(MAX_BULK_PHOTOS),
    albumEventId: objectIdString.nullable(),
  }),
]);

export const uploadRequestSchema = z.strictObject({
  albumEventId: objectIdString.nullable().default(null),
  uploaderName: z
    .string()
    .trim()
    .max(MAX_UPLOADER_NAME, `At most ${MAX_UPLOADER_NAME} characters`)
    .transform((v) => v || null)
    .nullable()
    .default(null),
  files: z
    .array(
      z.strictObject({
        clientId: z.string().min(1).max(40),
        contentType: z.enum(PHOTO_TYPES).default('image/webp'),
        width: z.number().int().min(1).max(10_000),
        height: z.number().int().min(1).max(10_000),
        displayBytes: z.number().int().min(1),
        thumbBytes: z.number().int().min(1),
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_REQUEST, `At most ${MAX_FILES_PER_REQUEST} photos at a time`),
});

export const completeUploadsSchema = z.strictObject({
  photoIds: z.array(objectIdString).min(1).max(MAX_FILES_PER_REQUEST),
});

/** A gallery link token: 22 URL-safe characters (database-design §7.1). */
export const galleryTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/**
 * Which photos to download: everything, an album (an event id or `general`), the hidden ones, or
 * a selection of photo ids (at most 200).
 */
export const downloadUrlsSchema = z.union([
  z.strictObject({
    album: z.union([z.enum(['all', 'general', 'hidden']), objectIdString]),
    cursor: objectIdString.nullable().default(null),
  }),
  z.strictObject({
    photoIds: z.array(objectIdString).min(1).max(MAX_BULK_PHOTOS),
  }),
]);
