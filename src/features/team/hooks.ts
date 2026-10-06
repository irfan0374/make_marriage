'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptInvite,
  cancelInvite,
  changeMember,
  createInvite,
  getTeam,
  removeMember,
  renewInvite,
} from '@/features/team/api';
import { meKey, weddingKey } from '@/features/weddings/hooks';
import type { ChangeMemberInput, CreateInviteInput } from '@/modules/team/team.types';

export const teamKey = (weddingId: string) => ['weddings', weddingId, 'team'] as const;

export function useTeam(weddingId: string) {
  return useQuery({ queryKey: teamKey(weddingId), queryFn: () => getTeam(weddingId) });
}

/**
 * Any change to the team: refetch everything about this wedding (the team list, and the
 * wedding itself, whose `me.role` changes if you change your own role) and /api/me.
 */
function useRefreshTeam(weddingId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: weddingKey(weddingId) });
    void queryClient.invalidateQueries({ queryKey: meKey });
  };
}

export function useCreateInvite(weddingId: string) {
  const onSuccess = useRefreshTeam(weddingId);
  return useMutation({
    mutationFn: (input: CreateInviteInput) => createInvite(weddingId, input),
    onSuccess,
  });
}

export function useRenewInvite(weddingId: string) {
  const onSuccess = useRefreshTeam(weddingId);
  return useMutation({
    mutationFn: (inviteId: string) => renewInvite(weddingId, inviteId),
    onSuccess,
  });
}

export function useCancelInvite(weddingId: string) {
  const onSuccess = useRefreshTeam(weddingId);
  return useMutation({
    mutationFn: (inviteId: string) => cancelInvite(weddingId, inviteId),
    onSuccess,
  });
}

export function useChangeMember(weddingId: string) {
  const onSuccess = useRefreshTeam(weddingId);
  return useMutation({
    mutationFn: ({ memberId, input }: { memberId: string; input: ChangeMemberInput }) =>
      changeMember(weddingId, memberId, input),
    onSuccess,
  });
}

export function useRemoveMember(weddingId: string) {
  const onSuccess = useRefreshTeam(weddingId);
  return useMutation({
    mutationFn: (memberId: string) => removeMember(weddingId, memberId),
    onSuccess,
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvite,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: meKey }),
  });
}
