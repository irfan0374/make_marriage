'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bulkHouseholds,
  createHousehold,
  deleteHousehold,
  getHouseholds,
  getHouseholdSummary,
  updateHousehold,
} from '@/features/guests/api';
import { weddingKey } from '@/features/weddings/hooks';
import type {
  BulkHouseholdsInput,
  CreateHouseholdInput,
  UpdateHouseholdInput,
} from '@/modules/households/households.types';

export const guestsKey = (weddingId: string) => ['weddings', weddingId, 'households'] as const;

/** One page of families for these filters; the previous page stays on screen while loading. */
export function useHouseholds(weddingId: string, query: URLSearchParams) {
  return useQuery({
    queryKey: [...guestsKey(weddingId), 'list', query.toString()],
    queryFn: () => getHouseholds(weddingId, query),
    placeholderData: keepPreviousData,
    // Emails go out from the queue in the background: while any family shown is still
    // "Sending", check again every few seconds so it turns "Sent" (or "Failed") by itself.
    refetchInterval: (q) =>
      q.state.data?.households.some((h) => h.inviteStatus === 'queued') ? 10_000 : false,
  });
}

export function useHouseholdSummary(weddingId: string) {
  return useQuery({
    queryKey: [...guestsKey(weddingId), 'summary'],
    queryFn: () => getHouseholdSummary(weddingId),
  });
}

/**
 * Any guest change: reload the lists and totals, and the wedding (new tags join its tag list).
 * Events are reloaded too, since their cards show invited families.
 */
function useRefreshGuests(weddingId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: guestsKey(weddingId) });
    void queryClient.invalidateQueries({ queryKey: weddingKey(weddingId), exact: true });
  };
}

export function useCreateHousehold(weddingId: string) {
  const onSettled = useRefreshGuests(weddingId);
  return useMutation({
    mutationFn: (input: CreateHouseholdInput) => createHousehold(weddingId, input),
    onSettled,
  });
}

export function useUpdateHousehold(weddingId: string) {
  const onSettled = useRefreshGuests(weddingId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHouseholdInput }) =>
      updateHousehold(weddingId, id, input),
    onSettled,
  });
}

export function useDeleteHousehold(weddingId: string) {
  const onSettled = useRefreshGuests(weddingId);
  return useMutation({
    mutationFn: (id: string) => deleteHousehold(weddingId, id),
    onSettled,
  });
}

export function useBulkHouseholds(weddingId: string) {
  const onSettled = useRefreshGuests(weddingId);
  return useMutation({
    mutationFn: (input: BulkHouseholdsInput) => bulkHouseholds(weddingId, input),
    onSettled,
  });
}
