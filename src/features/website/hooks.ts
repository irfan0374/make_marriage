'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changeSlug,
  checkSlug,
  getWebsite,
  setPublished,
  updateWebsite,
} from '@/features/website/api';
import type { UpdateWebsiteInput, WebsiteSettings } from '@/modules/website/website.types';
import { ApiError } from '@/shared/api-client';

export const websiteKey = (weddingId: string) => ['weddings', weddingId, 'website'] as const;

export function useWebsite(weddingId: string) {
  return useQuery({ queryKey: websiteKey(weddingId), queryFn: () => getWebsite(weddingId) });
}

/** Every save returns the whole settings object, which replaces the cached one. */
function useSaved(weddingId: string) {
  const queryClient = useQueryClient();
  return (settings: WebsiteSettings) => queryClient.setQueryData(websiteKey(weddingId), settings);
}

export function useUpdateWebsite(weddingId: string) {
  const onSuccess = useSaved(weddingId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWebsiteInput) => updateWebsite(weddingId, input),
    onSuccess,
    // Someone else changed the cover or photos first: load theirs before trying again.
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        void queryClient.invalidateQueries({ queryKey: websiteKey(weddingId) });
      }
    },
  });
}

export function useChangeSlug(weddingId: string) {
  const onSuccess = useSaved(weddingId);
  return useMutation({ mutationFn: (slug: string) => changeSlug(weddingId, slug), onSuccess });
}

export function useSetPublished(weddingId: string) {
  const onSuccess = useSaved(weddingId);
  return useMutation({
    mutationFn: (published: boolean) => setPublished(weddingId, published),
    onSuccess,
  });
}

/** Whether an address is free, checked as the Admin types (skipped for an empty field). */
export function useSlugCheck(weddingId: string, slug: string, enabled: boolean) {
  return useQuery({
    queryKey: [...websiteKey(weddingId), 'slug-check', slug],
    queryFn: () => checkSlug(weddingId, slug),
    enabled: enabled && slug.length > 0,
    staleTime: 10_000,
  });
}
