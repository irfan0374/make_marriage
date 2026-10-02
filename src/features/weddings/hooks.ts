'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createWedding, getMe, getWedding } from '@/features/weddings/api';

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
