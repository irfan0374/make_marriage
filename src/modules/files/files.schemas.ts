import { z } from 'zod';
import { objectIdString } from '@/shared/validation';

// Client-safe: file pickers check files with these same rules before asking for an upload URL
// (api-spec §15.2). Purposes are added as their features are built.

export const FILE_PURPOSES = [
  'invitation',
  'vendor_attachment',
  'receipt',
  'website_cover',
  'website_photo',
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

const MB = 1024 * 1024;

/** Allowed types and size per purpose. Invitation video waits for the thumbnail decision. */
const IMAGE_OR_PDF = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export const FILE_RULES: Record<FilePurpose, { types: readonly string[]; maxBytes: number }> = {
  invitation: { types: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 10 * MB },
  /** Quotes and contracts (PRD VEND-5). */
  vendor_attachment: { types: IMAGE_OR_PDF, maxBytes: 10 * MB },
  /** Expense receipts (PRD EXP-1). */
  receipt: { types: IMAGE_OR_PDF, maxBytes: 10 * MB },
  /** Website images are resized in the browser before upload (PRD WEB-3). */
  website_cover: { types: ['image/jpeg', 'image/webp'], maxBytes: 2 * MB },
  website_photo: { types: ['image/jpeg', 'image/webp'], maxBytes: 2 * MB },
};

export const presignFileSchema = z
  .strictObject({
    purpose: z.enum(FILE_PURPOSES),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.string().trim().toLowerCase().min(1).max(100),
    sizeBytes: z.number().int().min(1, 'The file is empty'),
    /** Which vendor a quote or contract is for (purpose `vendor_attachment` only). */
    vendorId: objectIdString.optional(),
  })
  .refine((input) => (input.purpose === 'vendor_attachment') === Boolean(input.vendorId), {
    message: 'vendorId is required for vendor attachments, and only for them',
    path: ['vendorId'],
  });

/** Why a file can't be used for `purpose`, or `null` if it can. */
export function fileProblem(
  purpose: FilePurpose,
  file: { contentType: string; sizeBytes: number },
): 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE' | null {
  const rules = FILE_RULES[purpose];
  if (!rules.types.includes(file.contentType.toLowerCase())) return 'UNSUPPORTED_FILE_TYPE';
  if (file.sizeBytes > rules.maxBytes) return 'FILE_TOO_LARGE';
  return null;
}

/** How many leading bytes `sniffImageType` and `sniffFileType` need. */
export const SNIFF_BYTES = 12;

/**
 * The image type a file's first bytes show, whatever its name or declared type says: JPEG, PNG
 * or WebP, else `null`. Used before and after upload, so a renamed file can't become a card.
 */
export function sniffImageType(
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const at = (offset: number, ...values: number[]) =>
    values.every((value, i) => bytes[offset + i] === value);
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

/**
 * The file type its first bytes show: one of the images above, or a PDF (`%PDF-`), else
 * `null`. Used before and after upload, so a renamed file can't pass as a receipt or contract.
 */
export function sniffFileType(
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
  const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d];
  if (pdf.every((value, i) => bytes[i] === value)) return 'application/pdf';
  return sniffImageType(bytes);
}
