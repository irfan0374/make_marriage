import 'server-only';
import { ObjectId, type ClientSession, type Filter } from 'mongodb';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { withTransaction } from '@/lib/db/transaction';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { trustWeddingId, type WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { headObject, presignUpload, readObjectStart } from '@/lib/r2';
import { enforceRateLimits, MINUTE } from '@/lib/rate-limit';
import { randomToken, sha256Hex } from '@/lib/tokens';
import { recordAudit } from '@/modules/audit';
import { listWeddingEvents } from '@/modules/events';
import { fileDownloadUrl, fileViewUrl, removeFile } from '@/modules/files';
import { requireAdmin, resolveWeddingContext } from '@/modules/members';
import { refreshSites } from '@/modules/website';
import {
  adjustGalleryBytes,
  getWeddingByGalleryToken,
  getWeddingRecord,
  requireWritableWedding,
  reserveGalleryBytes,
  saveGalleryFields,
  type WeddingDocument,
} from '@/modules/weddings';
import { addYears } from '@/shared/dates';
import { sniffImageType } from '@/modules/files/files.schemas';
import {
  galleryTokenSchema,
  MAX_DISPLAY_BYTES,
  MAX_FILES_PER_REQUEST,
  MAX_PHOTOS_PER_WEDDING,
  MAX_THUMB_BYTES,
  MAX_UPLOADER_NAME,
  ZIP_PART_SIZE,
} from './gallery.schemas';
import {
  clearAlbum,
  countPhotos,
  deletePhotos as deletePhotoDocs,
  findPhotos,
  findStalePendingPhotos,
  insertPhotos,
  listPhotos as listPhotoDocs,
  markReady,
  photoCounts,
  updatePhotos,
} from './gallery.repository';
import type {
  Album,
  BulkPhotosInput,
  CompleteResult,
  CompleteUploadsInput,
  DownloadPart,
  DownloadUrlsInput,
  GalleryOverview,
  ListPhotosQuery,
  Photo,
  PhotoDocument,
  PublicGallery,
  PublicPhoto,
  PublicPhotosQuery,
  UpdateGalleryInput,
  UpdatePhotoInput,
  UploadRequestInput,
  UploadTicket,
} from './gallery.types';

// The private photo gallery (PRD §5.10, api-spec §19). Guests upload through an unguessable link:
// their browser resizes each photo and makes a thumbnail, asks for upload links (which reserves
// storage against the wedding's cap), puts the files straight into R2 and confirms them. The
// couple and Managers moderate; Admins change the settings and the link.

const UPLOAD_URL_SECONDS = 30 * 60;
/** Unconfirmed uploads are removed after a day (database-design §11). */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

const galleryUrlOf = (token: string) => new URL(`/gallery/${token}`, getEnv().APP_URL).toString();

const EXTENSION = { 'image/webp': 'webp', 'image/jpeg': 'jpg' } as const;

/** Rate limit counters never hold the raw link. */
const linkKey = (token: string) => sha256Hex(token).slice(0, 24);

/** A visitor: their IP and browser, hashed (database-design §7.9). Never the raw IP. */
export const fingerprintOf = (ip: string, userAgent: string | null) =>
  sha256Hex(`${ip}|${userAgent ?? ''}`).slice(0, 32);

/* ------------------------------------------------------------------------------------------ */
/* Albums and photos                                                                           */
/* ------------------------------------------------------------------------------------------ */

async function albumsOf(weddingId: WeddingId): Promise<Album[]> {
  const events = await listWeddingEvents(weddingId);
  return [
    { albumEventId: null, name: 'General' },
    ...events.map((e) => ({ albumEventId: e.id, name: e.name })),
  ];
}

function albumNameOf(albums: Album[], id: ObjectId | null): string {
  const hex = id?.toHexString() ?? null;
  return albums.find((a) => a.albumEventId === hex)?.name ?? 'General';
}

/** "mehendi_66f4a1b2.webp": the album and a short part of the id, for downloads. */
function downloadNameOf(doc: PhotoDocument, albumName: string): string {
  const album =
    albumName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'photo';
  return `${album}_${doc._id.toHexString().slice(-8)}.${EXTENSION[doc.contentType]}`;
}

async function toPhoto(doc: PhotoDocument, albums: Album[]): Promise<Photo> {
  const albumName = albumNameOf(albums, doc.albumEventId);
  const [thumbUrl, displayUrl, downloadUrl] = await Promise.all([
    fileViewUrl(doc.thumbKey),
    fileViewUrl(doc.displayKey),
    fileDownloadUrl(doc.displayKey, downloadNameOf(doc, albumName)),
  ]);
  return {
    id: doc._id.toHexString(),
    albumEventId: doc.albumEventId?.toHexString() ?? null,
    albumName,
    uploaderName: doc.uploaderName,
    width: doc.width,
    height: doc.height,
    thumbUrl,
    displayUrl,
    downloadUrl,
    hidden: doc.hidden,
    sizeBytes: doc.sizeBytes ?? 0,
    uploadedAt: (doc.readyAt ?? doc.createdAt).toISOString(),
  };
}

function albumFilter(album: string | undefined): Filter<PhotoDocument> {
  if (album === undefined) return {};
  return { albumEventId: album === 'general' ? null : new ObjectId(album) };
}

/** An album to put photos in: `null` (General) or one of this wedding's events. */
async function resolveAlbum(weddingId: WeddingId, id: string | null): Promise<ObjectId | null> {
  if (id === null) return null;
  const events = await listWeddingEvents(weddingId);
  if (!events.some((e) => e.id === id)) {
    throw new AppError('VALIDATION_ERROR', 'Choose one of the albums.', {
      details: [{ path: 'albumEventId', message: 'Choose one of the albums' }],
    });
  }
  return new ObjectId(id);
}

/* ------------------------------------------------------------------------------------------ */
/* The couple: settings, link, QR                                                              */
/* ------------------------------------------------------------------------------------------ */

async function overviewOf(wedding: WeddingDocument): Promise<GalleryOverview> {
  const weddingId = trustWeddingId(wedding._id);
  const [albums, counts] = await Promise.all([albumsOf(weddingId), photoCounts(weddingId)]);
  const byId = new Map(counts.map((c) => [c._id?.toHexString() ?? null, c]));
  // Photos of an album that no longer exists count towards General (they're moved there).
  const orphans = counts
    .filter((c) => c._id && !albums.some((a) => a.albumEventId === c._id!.toHexString()))
    .reduce((sum, c) => sum + c.count, 0);
  const g = wedding.gallery;
  return {
    url: galleryUrlOf(g.token),
    uploadsOpen: g.uploadsOpen,
    guestViewing: g.guestViewing,
    storage: {
      usedBytes: g.storageUsedBytes,
      reservedBytes: g.storageReservedBytes,
      capBytes: g.storageCapBytes,
    },
    counts: {
      total: counts.reduce((sum, c) => sum + c.count, 0),
      hidden: counts.reduce((sum, c) => sum + c.hidden, 0),
      byAlbum: albums.map((a) => ({
        ...a,
        count: (byId.get(a.albumEventId)?.count ?? 0) + (a.albumEventId === null ? orphans : 0),
      })),
    },
    filesDeleteOn: addYears(wedding.weddingDate, 1),
  };
}

async function weddingOf(weddingId: WeddingId): Promise<WeddingDocument> {
  const wedding = await getWeddingRecord(weddingId);
  if (!wedding) throw new AppError('NOT_FOUND');
  return wedding;
}

/** GET /api/weddings/{weddingId}/gallery (api-spec §19.1). */
export async function getGallery(
  token: string | undefined,
  weddingId: ObjectId,
): Promise<GalleryOverview> {
  const context = await resolveWeddingContext(token, weddingId);
  return overviewOf(await weddingOf(context.weddingId));
}

/** PATCH /api/weddings/{weddingId}/gallery: uploads and guest viewing on or off. Admins only. */
export async function updateGallery(
  token: string | undefined,
  weddingId: ObjectId,
  input: UpdateGalleryInput,
  now = new Date(),
): Promise<GalleryOverview> {
  const context = await resolveWeddingContext(token, weddingId);
  requireAdmin(context);
  await requireWritableWedding(context.weddingId);
  const changes: Partial<Pick<WeddingDocument['gallery'], 'uploadsOpen' | 'guestViewing'>> = {};
  if (input.uploadsOpen !== undefined) changes.uploadsOpen = input.uploadsOpen;
  if (input.guestViewing !== undefined) changes.guestViewing = input.guestViewing;
  return overviewOf(await saveGalleryFields(context.weddingId, changes, now));
}

/**
 * POST /api/weddings/{weddingId}/gallery/regenerate-link: a new link; the old link and its QR
 * code stop working at once (PRD GAL-10). Admins only.
 */
export async function regenerateGalleryLink(
  token: string | undefined,
  weddingId: ObjectId,
  now = new Date(),
): Promise<GalleryOverview> {
  const context = await resolveWeddingContext(token, weddingId);
  requireAdmin(context);
  await requireWritableWedding(context.weddingId);
  // 16 random bytes = 128 bits, 22 URL-safe characters (database-design §7.1).
  const updated = await saveGalleryFields(context.weddingId, { token: randomToken(16) }, now);
  // The wedding website links to the gallery: show the new link there at once.
  refreshSites([updated.website.slug]);
  await recordAudit(context.weddingId, {
    actor: { type: 'user', userId: context.userId },
    action: 'gallery.link_regenerated',
    targetType: 'wedding',
    targetId: context.weddingId,
  });
  return overviewOf(updated);
}

/** GET /api/weddings/{weddingId}/gallery/qr?format=png|svg: the gallery link as a QR code. */
export async function galleryQrCode(
  token: string | undefined,
  weddingId: ObjectId,
  format: 'png' | 'svg',
): Promise<{ body: Uint8Array | string; contentType: string; fileName: string }> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await weddingOf(context.weddingId);
  const url = galleryUrlOf(wedding.gallery.token);
  // High error correction, so a slightly smudged printed code still scans.
  const options = { errorCorrectionLevel: 'H' as const, margin: 2 };
  const fileName = `gallery-qr.${format}`;
  if (format === 'svg') {
    return {
      body: await QRCode.toString(url, { ...options, type: 'svg' }),
      contentType: 'image/svg+xml',
      fileName,
    };
  }
  return {
    body: new Uint8Array(await QRCode.toBuffer(url, { ...options, width: 1200 })),
    contentType: 'image/png',
    fileName,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* The couple: photos                                                                          */
/* ------------------------------------------------------------------------------------------ */

/** GET /api/weddings/{weddingId}/gallery/photos (api-spec §19.1). Hidden ones included. */
export async function listPhotos(
  token: string | undefined,
  weddingId: ObjectId,
  query: ListPhotosQuery,
): Promise<{ photos: Photo[]; nextCursor: string | null }> {
  const context = await resolveWeddingContext(token, weddingId);
  const filter: Filter<PhotoDocument> = { status: 'ready', ...albumFilter(query.album) };
  if (query.hidden) filter.hidden = query.hidden === 'true';
  const [docs, albums] = await Promise.all([
    listPhotoDocs(
      context.weddingId,
      filter,
      query.limit + 1,
      query.cursor ? new ObjectId(query.cursor) : undefined,
    ),
    albumsOf(context.weddingId),
  ]);
  const page = docs.slice(0, query.limit);
  return {
    photos: await Promise.all(page.map((d) => toPhoto(d, albums))),
    nextCursor: docs.length > query.limit ? page.at(-1)!._id.toHexString() : null,
  };
}

/** PATCH /api/weddings/{weddingId}/gallery/photos/{photoId}: hide, show or move one photo. */
export async function updatePhoto(
  token: string | undefined,
  weddingId: ObjectId,
  photoId: ObjectId,
  input: UpdatePhotoInput,
  now = new Date(),
): Promise<Photo> {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  const set: Partial<Pick<PhotoDocument, 'hidden' | 'albumEventId'>> = {};
  if (input.hidden !== undefined) set.hidden = input.hidden;
  if (input.albumEventId !== undefined) {
    set.albumEventId = await resolveAlbum(context.weddingId, input.albumEventId);
  }
  const result = await updatePhotos(context.weddingId, [photoId], set, now);
  if (result.matchedCount === 0) throw new AppError('NOT_FOUND');
  const [doc] = await findPhotos(context.weddingId, [photoId]);
  return toPhoto(doc!, await albumsOf(context.weddingId));
}

/**
 * Delete photos and free their storage in one transaction (database-design §9), then remove
 * their files. Returns how many were deleted.
 */
async function removePhotos(
  weddingId: WeddingId,
  ids: ObjectId[],
  actor: { type: 'user'; userId: ObjectId } | null,
  /** Only uploads not yet confirmed (the clean-up never removes a photo confirmed meanwhile). */
  onlyPending = false,
): Promise<number> {
  let deleted: PhotoDocument[] = [];
  await withTransaction(async (session) => {
    deleted = await deletePhotoDocs(weddingId, ids, session, onlyPending);
    await releaseStorage(weddingId, deleted, session);
  });
  await Promise.all(deleted.flatMap((d) => [removeFile(d.displayKey), removeFile(d.thumbKey)]));
  if (actor && deleted.length > 0) {
    await recordAudit(
      weddingId,
      deleted.map((d) => ({
        actor,
        action: 'photo.deleted' as const,
        targetType: 'photo' as const,
        targetId: d._id,
        meta: { uploaderName: d.uploaderName },
      })),
    );
  }
  return deleted.length;
}

/** Give back the storage of deleted photos: used bytes for ready ones, reserved for pending. */
function releaseStorage(weddingId: WeddingId, docs: PhotoDocument[], session?: ClientSession) {
  const used = docs.reduce((s, d) => s + (d.status === 'ready' ? (d.sizeBytes ?? 0) : 0), 0);
  const reserved = docs.reduce((s, d) => s + (d.status === 'pending' ? d.reservedBytes : 0), 0);
  if (used === 0 && reserved === 0) return Promise.resolve();
  return adjustGalleryBytes(weddingId, { used: -used, reserved: -reserved }, session);
}

/** DELETE /api/weddings/{weddingId}/gallery/photos/{photoId}. */
export async function deletePhoto(
  token: string | undefined,
  weddingId: ObjectId,
  photoId: ObjectId,
): Promise<void> {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  const count = await removePhotos(context.weddingId, [photoId], {
    type: 'user',
    userId: context.userId,
  });
  if (count === 0) throw new AppError('NOT_FOUND');
}

/** POST /api/weddings/{weddingId}/gallery/photos/bulk: hide, show, move or delete up to 200. */
export async function bulkPhotos(
  token: string | undefined,
  weddingId: ObjectId,
  input: BulkPhotosInput,
  now = new Date(),
): Promise<{ updated: number }> {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  const ids = [...new Set(input.photoIds)].map((id) => new ObjectId(id));
  if (input.action === 'delete') {
    const updated = await removePhotos(context.weddingId, ids, {
      type: 'user',
      userId: context.userId,
    });
    return { updated };
  }
  const set: Partial<Pick<PhotoDocument, 'hidden' | 'albumEventId'>> =
    input.action === 'move'
      ? { albumEventId: await resolveAlbum(context.weddingId, input.albumEventId) }
      : { hidden: input.action === 'hide' };
  const result = await updatePhotos(context.weddingId, ids, set, now);
  return { updated: result.matchedCount };
}

/**
 * POST /api/weddings/{weddingId}/gallery/download-urls (api-spec §19.1): one ZIP part of up to
 * 500 photos (newest first, hidden ones included) with signed links, for the team to download
 * everything, an album or a selection. The browser builds the ZIP.
 */
export async function downloadUrls(
  token: string | undefined,
  weddingId: ObjectId,
  input: DownloadUrlsInput,
): Promise<DownloadPart> {
  const context = await resolveWeddingContext(token, weddingId);
  const albums = await albumsOf(context.weddingId);
  let docs: PhotoDocument[];
  let total: number;
  let before = 0;
  let nextCursor: string | null = null;
  if ('photoIds' in input) {
    const ids = [...new Set(input.photoIds)].map((id) => new ObjectId(id));
    docs = (await findPhotos(context.weddingId, ids)).filter((d) => d.status === 'ready');
    total = docs.length;
  } else {
    const filter: Filter<PhotoDocument> = { status: 'ready' };
    if (input.album === 'hidden') filter.hidden = true;
    else if (input.album !== 'all') Object.assign(filter, albumFilter(input.album));
    const cursor = input.cursor ? new ObjectId(input.cursor) : undefined;
    const [page, count, earlier] = await Promise.all([
      listPhotoDocs(context.weddingId, filter, ZIP_PART_SIZE + 1, cursor),
      countPhotos(context.weddingId, filter),
      cursor ? countPhotos(context.weddingId, { ...filter, _id: { $gte: cursor } }) : 0,
    ]);
    docs = page.slice(0, ZIP_PART_SIZE);
    total = count;
    before = earlier;
    if (page.length > ZIP_PART_SIZE) nextCursor = docs.at(-1)!._id.toHexString();
  }
  const files = await Promise.all(
    docs.map(async (d) => ({
      photoId: d._id.toHexString(),
      fileName: downloadNameOf(d, albumNameOf(albums, d.albumEventId)),
      url: await fileViewUrl(d.displayKey),
      sizeBytes: d.sizeBytes ?? 0,
    })),
  );
  return {
    files,
    nextCursor,
    part: Math.floor(before / ZIP_PART_SIZE) + 1,
    totalParts: Math.max(1, Math.ceil(total / ZIP_PART_SIZE)),
  };
}

/** Photos of a deleted event move to "General" (called by the cleanup module, in its transaction). */
export async function movePhotosToGeneral(
  weddingId: WeddingId,
  eventId: ObjectId,
  session: ClientSession,
): Promise<void> {
  await clearAlbum(weddingId, eventId, session);
}

/* ------------------------------------------------------------------------------------------ */
/* Guests                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** The wedding behind a gallery link, or 404 LINK_INVALID (unknown or replaced). */
async function resolveGalleryLink(token: string): Promise<WeddingDocument> {
  if (!galleryTokenSchema.safeParse(token).success) throw new AppError('LINK_INVALID');
  const wedding = await getWeddingByGalleryToken(token);
  if (!wedding) throw new AppError('LINK_INVALID');
  return wedding as WeddingDocument;
}

/** Browsing: 120 a minute per link and device (architecture §12). */
function limitBrowsing(token: string, fingerprint: string, now: Date) {
  return enforceRateLimits(
    [{ key: `gallery:view:${linkKey(token)}:${fingerprint}`, limit: 120, windowMs: MINUTE }],
    now,
  );
}

/** Uploads stay open only while the wedding is active and the couple allows them. */
const uploadsOpenFor = (wedding: WeddingDocument) =>
  wedding.status === 'active' && wedding.gallery.uploadsOpen;

/** GET /api/public/gallery/{token} (api-spec §19.2). */
export async function getPublicGallery(
  token: string,
  fingerprint: string,
  now = new Date(),
): Promise<PublicGallery> {
  await limitBrowsing(token, fingerprint, now);
  const wedding = await resolveGalleryLink(token);
  const weddingId = trustWeddingId(wedding._id);
  const viewing = wedding.gallery.guestViewing;
  const [albums, counts] = await Promise.all([
    albumsOf(weddingId),
    viewing ? photoCounts(weddingId) : null,
  ]);
  // What guests can see: ready, not hidden. Photos of a removed album count as General.
  const visible = new Map<string | null, number>();
  for (const c of counts ?? []) {
    const id = c._id?.toHexString() ?? null;
    const album = albums.some((a) => a.albumEventId === id) ? id : null;
    visible.set(album, (visible.get(album) ?? 0) + c.count - c.hidden);
  }
  return {
    weddingName: `${wedding.brideName} & ${wedding.groomName}`,
    uploadsOpen: uploadsOpenFor(wedding),
    guestViewing: viewing,
    albums: albums.map((a) => ({
      ...a,
      count: counts ? (visible.get(a.albumEventId) ?? 0) : null,
    })),
    photoCount: counts ? [...visible.values()].reduce((s, n) => s + n, 0) : null,
    limits: {
      maxFilesPerRequest: MAX_FILES_PER_REQUEST,
      maxDisplayBytes: MAX_DISPLAY_BYTES,
      maxThumbBytes: MAX_THUMB_BYTES,
    },
  };
}

/**
 * The gallery page `/gallery/{token}`: its details, or `null` for a link that doesn't work. The
 * visitor is recognised from the request, as in the API.
 */
export async function getGalleryPage(token: string): Promise<PublicGallery | null> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  try {
    return await getPublicGallery(token, fingerprintOf(ip, h.get('user-agent')));
  } catch (error) {
    if (error instanceof AppError && error.code === 'LINK_INVALID') return null;
    throw error;
  }
}

/** GET /api/public/gallery/{token}/photos: ready, not hidden; only while viewing is on. */
export async function listPublicPhotos(
  token: string,
  fingerprint: string,
  query: PublicPhotosQuery,
  now = new Date(),
): Promise<{ photos: PublicPhoto[]; nextCursor: string | null }> {
  await limitBrowsing(token, fingerprint, now);
  const wedding = await resolveGalleryLink(token);
  if (!wedding.gallery.guestViewing) throw new AppError('GALLERY_VIEWING_OFF');
  const weddingId = trustWeddingId(wedding._id);
  const [docs, albums] = await Promise.all([
    listPhotoDocs(
      weddingId,
      { status: 'ready', hidden: false, ...albumFilter(query.album) },
      query.limit + 1,
      query.cursor ? new ObjectId(query.cursor) : undefined,
    ),
    albumsOf(weddingId),
  ]);
  const page = docs.slice(0, query.limit);
  const photos = await Promise.all(page.map((d) => toPhoto(d, albums)));
  return {
    photos: photos.map((p) => {
      const { hidden, sizeBytes, ...rest } = p;
      void hidden;
      void sizeBytes;
      return rest;
    }),
    nextCursor: docs.length > query.limit ? page.at(-1)!._id.toHexString() : null,
  };
}

/** Who is uploading: a guest through the link, or a team member (their name is shown). */
interface Uploader {
  name: string | null;
  by: PhotoDocument['uploadedBy'];
  fingerprint: string | null;
}

/**
 * Reserve storage and give signed upload links for each photo's display copy and thumbnail
 * (api-spec §19.2). Guests need uploads to be open; the team can always add photos while the
 * wedding is active. Both count against the storage cap and the photo limit.
 */
async function issueUploads(
  weddingId: WeddingId,
  input: UploadRequestInput,
  uploader: Uploader,
  guest: boolean,
  now: Date,
): Promise<UploadTicket> {
  if (
    input.files.some((f) => f.displayBytes > MAX_DISPLAY_BYTES || f.thumbBytes > MAX_THUMB_BYTES)
  ) {
    throw new AppError('FILE_TOO_LARGE');
  }
  const albumEventId = await resolveAlbum(weddingId, input.albumEventId);
  if ((await countPhotos(weddingId)) + input.files.length > MAX_PHOTOS_PER_WEDDING) {
    throw new AppError('PHOTO_LIMIT_REACHED');
  }

  const total = input.files.reduce((s, f) => s + f.displayBytes + f.thumbBytes, 0);
  if (!(await reserveGalleryBytes(weddingId, total, guest))) {
    // Closed or archived a moment ago, or the cap would be passed.
    const fresh = await getWeddingRecord(weddingId);
    if (!fresh || fresh.status !== 'active')
      throw new AppError(guest ? 'UPLOADS_CLOSED' : 'WEDDING_ARCHIVED');
    if (guest && !fresh.gallery.uploadsOpen) throw new AppError('UPLOADS_CLOSED');
    throw new AppError('STORAGE_LIMIT_REACHED');
  }

  const batchId = `up_${randomToken(6)}`;
  const base = `weddings/${weddingId.toHexString()}/gallery/`;
  const docs: Omit<PhotoDocument, 'weddingId'>[] = input.files.map((f) => {
    const _id = new ObjectId();
    const ext = EXTENSION[f.contentType];
    return {
      _id,
      albumEventId,
      uploaderName: uploader.name,
      uploadedBy: uploader.by,
      contentType: f.contentType,
      displayKey: `${base}${_id.toHexString()}/display.${ext}`,
      thumbKey: `${base}${_id.toHexString()}/thumb.${ext}`,
      width: f.width,
      height: f.height,
      reservedBytes: f.displayBytes + f.thumbBytes,
      sizeBytes: null,
      status: 'pending',
      hidden: false,
      uploadBatchId: batchId,
      uploaderFingerprint: uploader.fingerprint,
      readyAt: null,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    };
  });
  try {
    await insertPhotos(weddingId, docs);
  } catch (error) {
    await adjustGalleryBytes(weddingId, { reserved: -total });
    throw error;
  }

  const uploads = await Promise.all(
    input.files.map(async (f, i) => {
      const doc = docs[i]!;
      const [display, thumb] = await Promise.all([
        presignUpload(doc.displayKey, f.contentType, f.displayBytes, UPLOAD_URL_SECONDS),
        presignUpload(doc.thumbKey, f.contentType, f.thumbBytes, UPLOAD_URL_SECONDS),
      ]);
      return { clientId: f.clientId, photoId: doc._id.toHexString(), display, thumb };
    }),
  );
  return {
    batchId,
    expiresAt: new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000).toISOString(),
    uploads,
  };
}

/**
 * POST /api/public/gallery/{token}/uploads: a guest's upload links (api-spec §19.2). 30
 * requests per 10 minutes per link and device.
 */
export async function createUploads(
  token: string,
  fingerprint: string,
  input: UploadRequestInput,
  now = new Date(),
): Promise<UploadTicket> {
  await enforceRateLimits(
    [{ key: `gallery:upload:${linkKey(token)}:${fingerprint}`, limit: 30, windowMs: 10 * MINUTE }],
    now,
  );
  const wedding = await resolveGalleryLink(token);
  if (!uploadsOpenFor(wedding)) throw new AppError('UPLOADS_CLOSED');
  return issueUploads(
    trustWeddingId(wedding._id),
    input,
    { name: input.uploaderName, by: { type: 'guest' }, fingerprint },
    true,
    now,
  );
}

/**
 * POST /api/weddings/{weddingId}/gallery/uploads: the team's own upload links (api-spec §19.1),
 * even while guest uploads are off. Their name is shown on the photos.
 */
export async function createTeamUploads(
  token: string | undefined,
  weddingId: ObjectId,
  input: UploadRequestInput,
  now = new Date(),
): Promise<UploadTicket> {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  return issueUploads(
    context.weddingId,
    input,
    {
      name: context.user.name.slice(0, MAX_UPLOADER_NAME),
      by: { type: 'member', userId: context.userId },
      fingerprint: null,
    },
    false,
    now,
  );
}

/** Whether a stored file is there and really an image of its type. */
async function checkStored(key: string, contentType: string): Promise<'ok' | 'missing' | 'bad'> {
  const stored = await headObject(key);
  if (!stored) return 'missing';
  const start = await readObjectStart(key, 12);
  if (!start) return 'missing';
  return sniffImageType(start) === contentType ? 'ok' : 'bad';
}

/** Confirm uploaded photos of this wedding (see `completeUploads`). Safe to repeat. */
async function confirmUploads(
  weddingId: WeddingId,
  input: CompleteUploadsInput,
  now: Date,
): Promise<CompleteResult> {
  const ids = [...new Set(input.photoIds)].map((id) => new ObjectId(id));
  const docs = new Map(
    (await findPhotos(weddingId, ids)).map((d) => [d._id.toHexString(), d] as const),
  );
  const result: CompleteResult = { ready: [], missing: [], rejected: [] };

  // In the order sent, so the browser can match results to its files.
  for (const id of new Set(input.photoIds)) {
    const doc = docs.get(id);
    if (!doc) {
      result.missing.push(id);
      continue;
    }
    if (doc.status === 'ready') {
      result.ready.push(id);
      continue;
    }
    const [display, thumb] = await Promise.all([
      checkStored(doc.displayKey, doc.contentType),
      checkStored(doc.thumbKey, doc.contentType),
    ]);
    if (display === 'bad' || thumb === 'bad') {
      await removePhotos(weddingId, [doc._id], null, true);
      result.rejected.push(id);
      continue;
    }
    if (display === 'missing' || thumb === 'missing') {
      result.missing.push(id);
      continue;
    }
    const [d, t] = await Promise.all([headObject(doc.displayKey), headObject(doc.thumbKey)]);
    const sizeBytes = (d?.sizeBytes ?? 0) + (t?.sizeBytes ?? 0);
    await withTransaction(async (session) => {
      if (await markReady(weddingId, doc._id, sizeBytes, now, session)) {
        await adjustGalleryBytes(
          weddingId,
          { reserved: -doc.reservedBytes, used: sizeBytes },
          session,
        );
      }
    });
    result.ready.push(id);
  }
  return result;
}

/**
 * POST /api/public/gallery/{token}/uploads/complete: confirm uploaded photos (api-spec §19.2).
 * Each photo's files must be in storage and really be images; its reserved storage becomes used.
 * Safe to repeat. Only photos uploaded through this link's wedding count.
 */
export async function completeUploads(
  token: string,
  fingerprint: string,
  input: CompleteUploadsInput,
  now = new Date(),
): Promise<CompleteResult> {
  await enforceRateLimits(
    [{ key: `gallery:upload:${linkKey(token)}:${fingerprint}`, limit: 30, windowMs: 10 * MINUTE }],
    now,
  );
  const wedding = await resolveGalleryLink(token);
  return confirmUploads(trustWeddingId(wedding._id), input, now);
}

/** POST /api/weddings/{weddingId}/gallery/uploads/complete: the team confirms its uploads. */
export async function completeTeamUploads(
  token: string | undefined,
  weddingId: ObjectId,
  input: CompleteUploadsInput,
  now = new Date(),
): Promise<CompleteResult> {
  const context = await resolveWeddingContext(token, weddingId);
  return confirmUploads(context.weddingId, input, now);
}

/**
 * Remove uploads never confirmed within a day: their files, their records and their reserved
 * storage (database-design §11). Part of the scheduled run; safe to call any time.
 */
export async function cleanupPendingPhotos(now = new Date()): Promise<{ photosRemoved: number }> {
  const stale = await findStalePendingPhotos(new Date(now.getTime() - PENDING_TTL_MS), 500);
  const byWedding = new Map<string, ObjectId[]>();
  for (const p of stale) {
    const key = p.weddingId.toHexString();
    byWedding.set(key, [...(byWedding.get(key) ?? []), p._id]);
  }
  let photosRemoved = 0;
  for (const [weddingHex, ids] of byWedding) {
    // Read straight from the photos collection by the scheduled run itself.
    const weddingId = trustWeddingId(new ObjectId(weddingHex));
    try {
      photosRemoved += await removePhotos(weddingId, ids, null, true);
    } catch (error) {
      logger.warn('gallery.cleanup_failed', { weddingId: weddingHex, err: error });
    }
  }
  return { photosRemoved };
}
