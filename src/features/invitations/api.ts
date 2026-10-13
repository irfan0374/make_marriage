import type { Household, RsvpSummary } from '@/modules/households/households.types';
import type { HostRsvpInput } from '@/modules/households/households.types';
import type { FilePurpose } from '@/modules/files/files.schemas';
import type { PresignedUpload } from '@/modules/files/files.types';
import type {
  InvitationSettings,
  PublicInvitation,
  RemindFamiliesInput,
  SendInvitationsInput,
  SendResult,
  UpdateInvitationInput,
} from '@/modules/invitations/invitations.types';
import type { BatchCounts } from '@/modules/jobs/jobs.types';
import type { GuestRsvpInput } from '@/modules/households/households.types';
import { ApiError, apiFetch, postJson } from '@/shared/api-client';

const wedding = (weddingId: string) => `/api/weddings/${weddingId}`;
const households = (weddingId: string) => `${wedding(weddingId)}/households`;

export const getInvitationSettings = (weddingId: string) =>
  apiFetch<InvitationSettings>(`${wedding(weddingId)}/invitation`);
export const saveInvitationSettings = (weddingId: string, input: UpdateInvitationInput) =>
  apiFetch<InvitationSettings>(`${wedding(weddingId)}/invitation`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
export const sendTestInvitation = (weddingId: string) =>
  postJson<{ sentTo: string }>(`${wedding(weddingId)}/invitation/test`);
// Sending by email (api-spec §10.4–10.7).
export const sendInvitations = (weddingId: string, input: SendInvitationsInput) =>
  postJson<SendResult>(`${wedding(weddingId)}/invitation/send`, input);
export const remindFamilies = (weddingId: string, input: RemindFamiliesInput) =>
  postJson<SendResult>(`${wedding(weddingId)}/invitation/remind`, input);
export const getBatches = (weddingId: string) =>
  apiFetch<BatchCounts[]>(`${wedding(weddingId)}/invitation/batches`);
export const cancelBatch = (weddingId: string, batchId: string) =>
  postJson<BatchCounts>(`${wedding(weddingId)}/invitation/batches/${batchId}/cancel`);

export const getRsvpSummary = (weddingId: string) =>
  apiFetch<RsvpSummary>(`${wedding(weddingId)}/rsvp/summary`);
export const rsvpExportUrl = (weddingId: string) => `${wedding(weddingId)}/rsvp/export`;

/**
 * Upload a file straight to storage (api-spec §15): ask for a signed URL, PUT the file there,
 * and return the key to save with the record. The app server never sees the file.
 */
export async function uploadFile(
  weddingId: string,
  purpose: FilePurpose,
  file: File,
): Promise<string> {
  const upload = await postJson<PresignedUpload>(`${wedding(weddingId)}/files/presign`, {
    purpose,
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
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
      "The card couldn't be uploaded. Check your connection and try again.",
      response.status,
    );
  }
  return upload.key;
}

// Host tools on a family (api-spec §9.10–9.13).
export const regenerateLink = (weddingId: string, householdId: string) =>
  postJson<{ inviteLink: string }>(`${households(weddingId)}/${householdId}/regenerate-link`);
export const markSent = (weddingId: string, householdId: string) =>
  postJson<Household>(`${households(weddingId)}/${householdId}/mark-sent`);
export const recordRsvp = (
  weddingId: string,
  householdId: string,
  eventId: string,
  input: HostRsvpInput,
) =>
  apiFetch<Household>(`${households(weddingId)}/${householdId}/rsvps/${eventId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
export const clearRsvp = (weddingId: string, householdId: string, eventId: string) =>
  apiFetch<void>(`${households(weddingId)}/${householdId}/rsvps/${eventId}`, {
    method: 'DELETE',
  });

// The guest page (api-spec §11).
const publicBase = (token: string) => `/api/public/invitations/${token}`;
export const saveGuestReplies = (token: string, input: GuestRsvpInput) =>
  apiFetch<PublicInvitation>(`${publicBase(token)}/rsvp`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
export const markOpened = (token: string) => postJson<void>(`${publicBase(token)}/opened`);
export const stopReminders = (token: string) =>
  postJson<void>(`${publicBase(token)}/stop-reminders`);
export const calendarUrl = (token: string, eventId: string) =>
  `${publicBase(token)}/events/${eventId}/calendar.ics`;
