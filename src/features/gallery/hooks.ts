'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkPhotosInput, UpdateGalleryInput } from '@/modules/gallery/gallery.types';
import {
  bulkPhotos,
  deletePhoto,
  getGallery,
  getPhotos,
  getPublicPhotos,
  regenerateLink,
  updateGallery,
} from './api';

export const galleryKey = (weddingId: string) => ['weddings', weddingId, 'gallery'] as const;

export function useGallery(weddingId: string) {
  return useQuery({ queryKey: galleryKey(weddingId), queryFn: () => getGallery(weddingId) });
}

/** The team's photos for a filter, 60 at a time ("Load more"). */
export function usePhotos(weddingId: string, query: URLSearchParams) {
  return useInfiniteQuery({
    queryKey: [...galleryKey(weddingId), 'photos', query.toString()],
    queryFn: ({ pageParam }) => getPhotos(weddingId, query, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

function useRefresh(weddingId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: galleryKey(weddingId) });
}

export function useUpdateGallery(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGalleryInput) => updateGallery(weddingId, input),
    onSuccess: (data) => queryClient.setQueryData(galleryKey(weddingId), data),
  });
}

export function useRegenerateLink(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({ mutationFn: () => regenerateLink(weddingId), onSettled });
}

export function useBulkPhotos(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({
    mutationFn: (input: BulkPhotosInput) => bulkPhotos(weddingId, input),
    onSettled,
  });
}

export function useDeletePhoto(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({
    mutationFn: (photoId: string) => deletePhoto(weddingId, photoId),
    onSettled,
  });
}

/** The guests' photos for an album, newest first, loading more as they scroll. */
export function usePublicPhotos(token: string, album: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['gallery', token, 'photos', album ?? 'all'],
    queryFn: ({ pageParam }) => getPublicPhotos(token, album, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    // Signed photo links last an hour; refresh well before.
    staleTime: 10 * 60 * 1000,
  });
}
