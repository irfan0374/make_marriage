import type { z } from 'zod';
import type { presignFileSchema } from './files.schemas';

export type PresignFileInput = z.output<typeof presignFileSchema>;

/** `POST /files/presign` response (api-spec §15.2). */
export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

/** A file in storage, checked to belong to a wedding and fit its purpose. */
export interface VerifiedFile {
  key: string;
  sizeBytes: number;
  contentType: string;
}
