import type { CreateVendorInput, UpdateVendorInput, Vendor } from '@/modules/vendors/vendors.types';
import { apiFetch, postJson } from '@/shared/api-client';

const base = (weddingId: string) => `/api/weddings/${weddingId}/vendors`;

export const getVendors = (weddingId: string) => apiFetch<Vendor[]>(base(weddingId));
export const createVendor = (weddingId: string, input: CreateVendorInput) =>
  postJson<Vendor>(base(weddingId), input);
export const updateVendor = (weddingId: string, id: string, input: UpdateVendorInput) =>
  apiFetch<Vendor>(`${base(weddingId)}/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteVendor = (weddingId: string, id: string) =>
  apiFetch<void>(`${base(weddingId)}/${id}`, { method: 'DELETE' });
export const addAttachment = (
  weddingId: string,
  vendorId: string,
  input: { key: string; fileName: string },
) => postJson<Vendor>(`${base(weddingId)}/${vendorId}/attachments`, input);
export const removeAttachment = (weddingId: string, vendorId: string, attachmentId: string) =>
  apiFetch<void>(`${base(weddingId)}/${vendorId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  });
/** Opens the file through the app, which redirects to a short-lived storage link. */
export const attachmentUrl = (weddingId: string, vendorId: string, attachmentId: string) =>
  `${base(weddingId)}/${vendorId}/attachments/${attachmentId}`;
