'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { guestsKey } from '@/features/guests/hooks';
import {
  cancelBatch,
  clearRsvp,
  getBatches,
  remindFamilies,
  sendInvitations,
  getInvitationSettings,
  getRsvpSummary,
  markSent,
  recordRsvp,
  regenerateLink,
  saveInvitationSettings,
  sendTestInvitation,
} from '@/features/invitations/api';
import type { HostRsvpInput } from '@/modules/households/households.types';
import { ApiError } from '@/shared/api-client';
import type {
  RemindFamiliesInput,
  SendInvitationsInput,
  UpdateInvitationInput,
} from '@/modules/invitations/invitations.types';

export const invitationKey = (weddingId: string) => ['weddings', weddingId, 'invitation'] as const;

export function useInvitationSettings(weddingId: string) {
  return useQuery({
    queryKey: invitationKey(weddingId),
    queryFn: () => getInvitationSettings(weddingId),
    // The card's signed URL lasts an hour; refresh well before.
    staleTime: 5 * 60_000,
  });
}

export function useSaveInvitation(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateInvitationInput) => saveInvitationSettings(weddingId, input),
    onSuccess: (data) => {
      queryClient.setQueryData(invitationKey(weddingId), data);
      // The card, message and deadline decide who can be emailed or reminded.
      void queryClient.invalidateQueries({ queryKey: emailReachKey(weddingId) });
    },
  });
}

export function useSendTestInvitation(weddingId: string) {
  return useMutation({ mutationFn: () => sendTestInvitation(weddingId) });
}

/** Invitation and reply totals. Kept with the guest queries, so any guest change refreshes them. */
export function useRsvpSummary(weddingId: string) {
  return useQuery({
    queryKey: [...guestsKey(weddingId), 'rsvp-summary'],
    queryFn: () => getRsvpSummary(weddingId),
  });
}

function useRefreshGuests(weddingId: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: guestsKey(weddingId) });
}

export function useRegenerateLink(weddingId: string) {
  const onSettled = useRefreshGuests(weddingId);
  return useMutation({
    mutationFn: (householdId: string) => regenerateLink(weddingId, householdId),
    onSettled,
  });
}

export function useMarkSent(weddingId: string) {
  const onSettled = useRefreshGuests(weddingId);
  return useMutation({
    mutationFn: (householdId: string) => markSent(weddingId, householdId),
    onSettled,
  });
}

export function useRecordRsvp(weddingId: string) {
  const onSettled = useRefreshGuests(weddingId);
  return useMutation({
    mutationFn: (args: { householdId: string; eventId: string; input: HostRsvpInput }) =>
      recordRsvp(weddingId, args.householdId, args.eventId, args.input),
    onSettled,
  });
}

export function useClearRsvp(weddingId: string) {
  const onSettled = useRefreshGuests(weddingId);
  return useMutation({
    mutationFn: (args: { householdId: string; eventId: string }) =>
      clearRsvp(weddingId, args.householdId, args.eventId),
    onSettled,
  });
}

export type EmailKind = 'invite' | 'remind';
export type EmailRequest =
  { kind: 'invite'; input: SendInvitationsInput } | { kind: 'remind'; input: RemindFamiliesInput };

const emailCall = (weddingId: string, request: EmailRequest) =>
  request.kind === 'invite'
    ? sendInvitations(weddingId, request.input)
    : remindFamilies(weddingId, request.input);

/** Who an email send would reach, without sending (a dry run). */
export function useEmailPreview(weddingId: string, request: EmailRequest) {
  return useQuery({
    queryKey: ['weddings', weddingId, 'email-preview', request],
    queryFn: () =>
      emailCall(weddingId, {
        ...request,
        input: { ...request.input, dryRun: true },
      } as EmailRequest),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

const emailReachKey = (weddingId: string) => [...guestsKey(weddingId), 'email-reach'] as const;

/**
 * How many families "Email all not sent" or "Remind" would really reach: the same dry run the
 * confirmation shows, so the button's number and the dialog never disagree. Kept with the guest
 * queries, so any change to families refreshes it. Replies being closed counts as nobody.
 */
export function useEmailReach(weddingId: string, kind: EmailKind) {
  const request: EmailRequest =
    kind === 'invite'
      ? { kind, input: { filter: 'all_not_sent', dryRun: true } }
      : { kind, input: { filter: 'all_incomplete', dryRun: true } };
  return useQuery({
    queryKey: [...emailReachKey(weddingId), kind],
    queryFn: async () => {
      try {
        return (await emailCall(weddingId, request)).queued;
      } catch (error) {
        if (error instanceof ApiError && error.code === 'RSVP_CLOSED') return 0;
        throw error;
      }
    },
    retry: false,
  });
}

export const batchesKey = (weddingId: string) => ['weddings', weddingId, 'email-batches'] as const;

export function useSendEmails(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: EmailRequest) => emailCall(weddingId, request),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: guestsKey(weddingId) });
      void queryClient.invalidateQueries({ queryKey: batchesKey(weddingId) });
    },
  });
}

/** Recent sends; checked every few seconds while emails are still going out. */
export function useEmailBatches(weddingId: string) {
  return useQuery({
    queryKey: batchesKey(weddingId),
    queryFn: () => getBatches(weddingId),
    refetchInterval: (query) =>
      query.state.data?.some((batch) => batch.waiting > 0) ? 5_000 : false,
  });
}

export function useCancelBatch(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => cancelBatch(weddingId, batchId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: guestsKey(weddingId) });
      void queryClient.invalidateQueries({ queryKey: batchesKey(weddingId) });
    },
  });
}
