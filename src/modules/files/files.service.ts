import 'server-only';
import type { ObjectId } from 'mongodb';
import { AppError } from '@/lib/errors';
import type { WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import {
  deleteObject,
  headObject,
  presignDownload,
  presignUpload,
  readObjectStart,
} from '@/lib/r2';
import { randomToken } from '@/lib/tokens';
import { resolveWeddingContext } from '@/modules/members';
import { requireWritableWedding } from '@/modules/weddings';
import { fileProblem, SNIFF_BYTES, sniffFileType, type FilePurpose } from './files.schemas';
import type { PresignedUpload, PresignFileInput, VerifiedFile } from './files.types';

// Files in R2 (architecture §8): upload URLs, checking an upload before it's linked to a
// record, viewing URLs and removal. Every key starts with `weddings/{weddingId}/`, so one
// wedding's files can be found and removed together and can never be claimed by another.

const UPLOAD_URL_SECONDS = 10 * 60;
const VIEW_URL_SECONDS = 60 * 60;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

const FOLDERS: Record<FilePurpose, string> = {
  invitation: 'invitation',
  vendor_attachment: 'vendors',
  receipt: 'receipts',
  website_cover: 'website',
  website_photo: 'website',
};

/** A vendor's files sit in their own folder, so one vendor's upload can't be attached to another. */
function folderOf(weddingId: WeddingId, purpose: FilePurpose, vendorId?: string): string {
  const base = `weddings/${weddingId.toHexString()}/${FOLDERS[purpose]}/`;
  return vendorId ? `${base}${vendorId.toLowerCase()}/` : base;
}

/** POST /api/weddings/{weddingId}/files/presign (api-spec §15.2). */
export async function presignFileUpload(
  token: string | undefined,
  weddingId: ObjectId,
  input: PresignFileInput,
  now = new Date(),
): Promise<PresignedUpload> {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  const problem = fileProblem(input.purpose, input);
  if (problem) throw new AppError(problem);

  const key = `${folderOf(context.weddingId, input.purpose, input.vendorId)}${randomToken(12)}.${EXTENSIONS[input.contentType]}`;
  const { url, headers } = await presignUpload(
    key,
    input.contentType,
    input.sizeBytes,
    UPLOAD_URL_SECONDS,
  );
  return {
    key,
    uploadUrl: url,
    method: 'PUT',
    headers,
    expiresAt: new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000).toISOString(),
  };
}

/**
 * Check that `key` is an uploaded file of this wedding for `purpose`, with an allowed type and
 * size. Throws FILE_NOT_UPLOADED otherwise (also for another wedding's key). An image must
 * really be one of its declared type: the browser only declares a type, so a renamed file is
 * caught here by its first bytes, then deleted (UNSUPPORTED_FILE_TYPE).
 */
export async function verifyUploadedFile(
  weddingId: WeddingId,
  purpose: FilePurpose,
  key: string,
  vendorId?: ObjectId,
): Promise<VerifiedFile> {
  if (
    !key.startsWith(folderOf(weddingId, purpose, vendorId?.toHexString())) ||
    key.includes('..')
  ) {
    throw new AppError('FILE_NOT_UPLOADED');
  }
  const stored = await headObject(key);
  if (!stored) throw new AppError('FILE_NOT_UPLOADED');
  const problem = fileProblem(purpose, stored);
  if (problem) throw new AppError(problem);
  // Every allowed type (images and PDF) can be recognised by its first bytes.
  {
    const start = await readObjectStart(key, SNIFF_BYTES);
    if (!start) throw new AppError('FILE_NOT_UPLOADED');
    if (sniffFileType(start) !== stored.contentType.toLowerCase()) {
      await removeFile(key);
      throw new AppError('UNSUPPORTED_FILE_TYPE');
    }
  }
  return { key, ...stored };
}

/** A short-lived URL to show a stored file. */
export function fileViewUrl(key: string, expiresInSeconds = VIEW_URL_SECONDS): Promise<string> {
  return presignDownload(key, expiresInSeconds);
}

/** Remove a file that's no longer used. Best effort: a failure is logged, never thrown. */
export async function removeFile(key: string): Promise<void> {
  try {
    await deleteObject(key);
  } catch (error) {
    logger.warn('files.delete_failed', { err: error });
  }
}
