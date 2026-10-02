'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createWedding, getMe, getWedding, updateWedding } from '@/features/weddings/api';
import type { Me, UpdateWeddingInput } from '@/modules/weddings/weddings.types';

export const meKey = ['me'] as const;
export const weddingKey = (weddingId: string) => ['weddings', weddingId] as const;

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: getMe });
}

export function useWedding(weddingId: string) {
  return useQuery({
    queryKey: weddingKey(weddingId),
    queryFn: () => getWedding(weddingId),
    // A 404 (not a member, or no such wedding) won't change on retry.
    retry: false,
  });
}

/**
 * Create a wedding, then open it. The new wedding is cached so its page shows at once. `replace`,
 * not `push`: Back must not return to a blank form that would make a duplicate wedding.
 */
export function useCreateWedding() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: createWedding,
    onSuccess: (wedding) => {
      queryClient.setQueryData(weddingKey(wedding.id), wedding);
      void queryClient.invalidateQueries({ queryKey: meKey });
      router.replace(`/app/${wedding.id}`);
    },
  });
}

/**
 * Save changed wedding details. The cache gets the saved wedding, so the overview and top bar
 * update at once; `refresh` re-renders the server parts (the page title).
 */
export function useUpdateWedding(weddingId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: UpdateWeddingInput) => updateWedding(weddingId, input),
    onSuccess: (wedding) => {
      queryClient.setQueryData(weddingKey(weddingId), wedding);
      void queryClient.invalidateQueries({ queryKey: meKey });
      router.refresh();
    },
  });
}

/**
 * Whether the user already has their own wedding: they're an admin of one. Each person can be an
 * admin of one wedding only (PRD §4), so "Create a wedding" is offered only when this is false,
 * e.g. to a family member who is a Manager elsewhere.
 */
export function hasOwnWedding(me: Me): boolean {
  return me.weddings.some((wedding) => wedding.myRole === 'admin');
}
