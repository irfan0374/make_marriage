import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type {
  bulkPhotosSchema,
  completeUploadsSchema,
  listPhotosQuerySchema,
  PhotoType,
  publicPhotosQuerySchema,
  updateGallerySchema,
  updatePhotoSchema,
  uploadRequestSchema,
  downloadUrlsSchema,
} from './gallery.schemas';

/** `photos` collection (database-design §7.9). Files live in R2. */
export interface PhotoDocument {
  _id: ObjectId;
  weddingId: ObjectId;
  /** `null` is the "General" album. */
  albumEventId: ObjectId | null;
  uploaderName: string | null;
  /** Who uploaded: a guest through the gallery link, or a team member. */
  uploadedBy: { type: 'guest' } | { type: 'member'; userId: ObjectId };
  contentType: PhotoType;
  displayKey: string;
  thumbKey: string;
  width: number;
  height: number;
  /** Display plus thumbnail bytes reserved when the upload links were issued. */
  reservedBytes: number;
  /** Actual display plus thumbnail bytes, set on confirm. */
  sizeBytes: number | null;
  status: 'pending' | 'ready';
  hidden: boolean;
  uploadBatchId: string;
  /** Hash of IP and browser, for rate limits and abuse checks. Never the raw IP. */
  uploaderFingerprint: string | null;
  readyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  schemaVersion: 1;
}

export type UpdateGalleryInput = z.infer<typeof updateGallerySchema>;
export type ListPhotosQuery = z.infer<typeof listPhotosQuerySchema>;
export type PublicPhotosQuery = z.infer<typeof publicPhotosQuerySchema>;
export type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>;
export type BulkPhotosInput = z.infer<typeof bulkPhotosSchema>;
export type UploadRequestInput = z.infer<typeof uploadRequestSchema>;
export type CompleteUploadsInput = z.infer<typeof completeUploadsSchema>;
export type DownloadUrlsInput = z.infer<typeof downloadUrlsSchema>;

export interface Album {
  /** `null` is "General". */
  albumEventId: string | null;
  name: string;
}

/** A photo as the couple sees it (api-spec §19.1). Links are signed for 1 hour. */
export interface Photo {
  id: string;
  albumEventId: string | null;
  albumName: string;
  uploaderName: string | null;
  width: number;
  height: number;
  thumbUrl: string;
  displayUrl: string;
  /** Saves the file instead of opening it. */
  downloadUrl: string;
  hidden: boolean;
  sizeBytes: number;
  uploadedAt: string;
}

/** A photo as guests see it: never hidden ones, and no hidden flag. */
export type PublicPhoto = Omit<Photo, 'hidden' | 'sizeBytes'>;

/** GET /api/weddings/{weddingId}/gallery (api-spec §19.1). */
export interface GalleryOverview {
  url: string;
  uploadsOpen: boolean;
  guestViewing: boolean;
  storage: { usedBytes: number; reservedBytes: number; capBytes: number };
  counts: {
    total: number;
    hidden: number;
    byAlbum: (Album & { count: number })[];
  };
  /** Photos are kept until this day (a year after the wedding). */
  filesDeleteOn: string;
}

/** GET /api/public/gallery/{token} (api-spec §19.2). */
export interface PublicGallery {
  weddingName: string;
  uploadsOpen: boolean;
  guestViewing: boolean;
  /** With the photos guests can see in each, when viewing is on (`null` otherwise). */
  albums: (Album & { count: number | null })[];
  /** Ready photos guests can see, when viewing is on. */
  photoCount: number | null;
  limits: { maxFilesPerRequest: number; maxDisplayBytes: number; maxThumbBytes: number };
}

export interface UploadTicket {
  batchId: string;
  expiresAt: string;
  uploads: {
    clientId: string;
    photoId: string;
    display: { url: string; headers: Record<string, string> };
    thumb: { url: string; headers: Record<string, string> };
  }[];
}

export interface CompleteResult {
  ready: string[];
  /** Not found in storage yet: upload again with the same links, then confirm again. */
  missing: string[];
  /** Not a real image: removed. */
  rejected: string[];
}

/** One ZIP part's photos (api-spec §19.1): signed links valid for 1 hour. */
export interface DownloadPart {
  files: { photoId: string; fileName: string; url: string; sizeBytes: number }[];
  nextCursor: string | null;
  part: number;
  totalParts: number;
}
