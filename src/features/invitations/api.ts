import type { Household, RsvpSummary } from '@/modules/households/households.types';
import type { HostRsvpInput } from '@/modules/households/households.types';
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
import { apiFetch, postJson } from '@/shared/api-client';

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
export const notifyEventChange = (weddingId: string, eventId: string, input: { dryRun: boolean }) =>
  postJson<SendResult>(`${wedding(weddingId)}/events/${eventId}/notify-change`, input);
export const getBatches = (weddingId: string) =>
  apiFetch<BatchCounts[]>(`${wedding(weddingId)}/invitation/batches`);
export const cancelBatch = (weddingId: string, batchId: string) =>
  postJson<BatchCounts>(`${wedding(weddingId)}/invitation/batches/${batchId}/cancel`);

export const getRsvpSummary = (weddingId: string) =>
  apiFetch<RsvpSummary>(`${wedding(weddingId)}/rsvp/summary`);
export const rsvpExportUrl = (weddingId: string) => `${wedding(weddingId)}/rsvp/export`;

export { uploadFile } from '@/features/files/upload';

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
