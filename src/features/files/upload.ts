import {
  fileProblem,
  FILE_RULES,
  SNIFF_BYTES,
  sniffFileType,
  type FilePurpose,
} from '@/modules/files/files.schemas';
import type { PresignedUpload } from '@/modules/files/files.types';
import { ApiError, postJson } from '@/shared/api-client';

// Uploads straight from the browser to storage (api-spec §15, architecture §8): ask the API for a
// signed URL, PUT the file there, then save the returned key with the record. The app server
// never handles the file itself.

const MB = 1024 * 1024;

/** Readable names for the allowed types, e.g. "JPG, PNG, WebP or PDF". */
function typeNames(purpose: FilePurpose): string {
  const names = FILE_RULES[purpose].types.map((type) =>
    type === 'application/pdf'
      ? 'PDF'
      : type === 'image/jpeg'
        ? 'JPG'
        : type.split('/')[1]!.toUpperCase().replace('WEBP', 'WebP'),
  );
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0]!;
}

/**
 * Why `file` can't be uploaded for `purpose`, in words for the person, or `null` if it can.
 * The first bytes are checked too, so a renamed file is caught before it's sent.
 */
export async function fileCheck(purpose: FilePurpose, file: File): Promise<string | null> {
  const problem = fileProblem(purpose, { contentType: file.type, sizeBytes: file.size });
  if (problem === 'UNSUPPORTED_FILE_TYPE') return `Choose a ${typeNames(purpose)} file.`;
  if (problem === 'FILE_TOO_LARGE') {
    return `Choose a file under ${FILE_RULES[purpose].maxBytes / MB} MB.`;
  }
  const start = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  if (sniffFileType(start) !== file.type) {
    return `This file isn't really a ${typeNames(purpose)} file. Choose the original file.`;
  }
  return null;
}

/** Upload one file and return its storage key. */
export async function uploadFile(
  weddingId: string,
  purpose: FilePurpose,
  file: File,
  options: { vendorId?: string } = {},
): Promise<string> {
  const upload = await postJson<PresignedUpload>(`/api/weddings/${weddingId}/files/presign`, {
    purpose,
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    ...(options.vendorId ? { vendorId: options.vendorId } : {}),
  });
  // Content-Length is set by the browser itself from the body; it matches the signed size.
  const response = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': upload.headers['Content-Type']! },
    body: file,
  });
  if (!response.ok) {
    throw new ApiError(
      'FILE_NOT_UPLOADED',
      "The file couldn't be uploaded. Check your connection and try again.",
      response.status,
    );
  }
  return upload.key;
}
