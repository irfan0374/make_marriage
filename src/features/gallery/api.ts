import type {
  BulkPhotosInput,
  CompleteResult,
  DownloadPart,
  DownloadUrlsInput,
  GalleryOverview,
  Photo,
  PublicGallery,
  PublicPhoto,
  UpdateGalleryInput,
  UpdatePhotoInput,
  UploadRequestInput,
  UploadTicket,
} from '@/modules/gallery/gallery.types';
import { ApiError, apiFetch, postJson } from '@/shared/api-client';
import type { ErrorCode } from '@/shared/error-codes';

// The gallery's REST calls: the couple's (api-spec §19.1) and the guests' (api-spec §19.2).

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** One page of a list, with the envelope's `meta.nextCursor`. */
async function getPage<T>(path: string): Promise<Page<T>> {
  const response = await fetch(path, { credentials: 'same-origin' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      (body?.error?.code ?? 'INTERNAL_ERROR') as ErrorCode,
      body?.error?.message ?? 'Something went wrong. Please try again.',
      response.status,
      body?.error?.details,
    );
  }
  return { items: body.data, nextCursor: body.meta?.nextCursor ?? null };
}

const base = (weddingId: string) => `/api/weddings/${weddingId}/gallery`;
const pub = (token: string) => `/api/public/gallery/${token}`;

export const getGallery = (weddingId: string) => apiFetch<GalleryOverview>(base(weddingId));
export const updateGallery = (weddingId: string, input: UpdateGalleryInput) =>
  apiFetch<GalleryOverview>(base(weddingId), { method: 'PATCH', body: JSON.stringify(input) });
export const regenerateLink = (weddingId: string) =>
  postJson<GalleryOverview>(`${base(weddingId)}/regenerate-link`);
export const qrUrl = (weddingId: string, format: 'png' | 'svg') =>
  `${base(weddingId)}/qr?format=${format}`;

export function getPhotos(weddingId: string, query: URLSearchParams, cursor: string | null) {
  const q = new URLSearchParams(query);
  if (cursor) q.set('cursor', cursor);
  return getPage<Photo>(`${base(weddingId)}/photos?${q.toString()}`);
}
export const updatePhoto = (weddingId: string, photoId: string, input: UpdatePhotoInput) =>
  apiFetch<Photo>(`${base(weddingId)}/photos/${photoId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const deletePhoto = (weddingId: string, photoId: string) =>
  apiFetch<void>(`${base(weddingId)}/photos/${photoId}`, { method: 'DELETE' });
export const bulkPhotos = (weddingId: string, input: BulkPhotosInput) =>
  postJson<{ updated: number }>(`${base(weddingId)}/photos/bulk`, input);

export const getPublicGallery = (token: string) => apiFetch<PublicGallery>(pub(token));
export function getPublicPhotos(token: string, album: string | null, cursor: string | null) {
  const q = new URLSearchParams();
  if (album) q.set('album', album);
  if (cursor) q.set('cursor', cursor);
  return getPage<PublicPhoto>(`${pub(token)}/photos?${q.toString()}`);
}
export const requestUploads = (token: string, input: UploadRequestInput) =>
  postJson<UploadTicket>(`${pub(token)}/uploads`, input);
export const completeUploads = (token: string, photoIds: string[]) =>
  postJson<CompleteResult>(`${pub(token)}/uploads/complete`, { photoIds });

/** One ZIP part's photo links (api-spec §19.1), with its place among the parts. */
export async function getDownloadPart(
  weddingId: string,
  input: DownloadUrlsInput,
): Promise<DownloadPart> {
  const response = await fetch(`${base(weddingId)}/download-urls`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      (body?.error?.code ?? 'INTERNAL_ERROR') as ErrorCode,
      body?.error?.message ?? 'Something went wrong. Please try again.',
      response.status,
      body?.error?.details,
    );
  }
  return {
    files: body.data,
    nextCursor: body.meta.nextCursor,
    part: body.meta.part,
    totalParts: body.meta.totalParts,
  };
}

/** The team's own uploads go through the wedding's API instead of the guest link. */
export const requestTeamUploads = (weddingId: string, input: UploadRequestInput) =>
  postJson<UploadTicket>(`${base(weddingId)}/uploads`, input);
export const completeTeamUploads = (weddingId: string, photoIds: string[]) =>
  postJson<CompleteResult>(`${base(weddingId)}/uploads/complete`, { photoIds });
