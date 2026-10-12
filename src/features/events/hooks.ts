'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addPresetEvents,
  createEvent,
  deleteEvent,
  getEvents,
  reorderEvents,
  updateEvent,
} from '@/features/events/api';
import type {
  AddPresetEventsInput,
  CreateEventInput,
  UpdateEventInput,
  WeddingEvent,
} from '@/modules/events/events.types';

export const eventsKey = (weddingId: string) => ['weddings', weddingId, 'events'] as const;

export function useEvents(weddingId: string) {
  return useQuery({ queryKey: eventsKey(weddingId), queryFn: () => getEvents(weddingId) });
}

function useRefreshEvents(weddingId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: eventsKey(weddingId) });
}

export function useCreateEvent(weddingId: string) {
  const onSettled = useRefreshEvents(weddingId);
  return useMutation({
    mutationFn: (input: CreateEventInput) => createEvent(weddingId, input),
    onSettled,
  });
}

export function useAddPresetEvents(weddingId: string) {
  const onSettled = useRefreshEvents(weddingId);
  return useMutation({
    mutationFn: (input: AddPresetEventsInput) => addPresetEvents(weddingId, input),
    onSettled,
  });
}

export function useUpdateEvent(weddingId: string) {
  const onSettled = useRefreshEvents(weddingId);
  return useMutation({
    mutationFn: ({ eventId, input }: { eventId: string; input: UpdateEventInput }) =>
      updateEvent(weddingId, eventId, input),
    onSettled,
  });
}

export function useDeleteEvent(weddingId: string) {
  const refreshEvents = useRefreshEvents(weddingId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, confirm }: { eventId: string; confirm?: boolean }) =>
      deleteEvent(weddingId, eventId, confirm),
    // The event comes off families and tasks too.
    onSettled: () => {
      void refreshEvents();
      void queryClient.invalidateQueries({ queryKey: ['weddings', weddingId, 'households'] });
      void queryClient.invalidateQueries({ queryKey: ['weddings', weddingId, 'tasks'] });
    },
  });
}

/**
 * Save a new order. The list moves at once; if saving fails it moves back and reloads, so the
 * page never shows an order that isn't saved.
 */
export function useReorderEvents(weddingId: string) {
  const queryClient = useQueryClient();
  const key = eventsKey(weddingId);
  return useMutation({
    mutationFn: (events: WeddingEvent[]) =>
      reorderEvents(
        weddingId,
        events.map((event) => event.id),
      ),
    onMutate: async (events) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WeddingEvent[]>(key);
      queryClient.setQueryData(
        key,
        events.map((event, order) => ({ ...event, order })),
      );
      return { previous };
    },
    onError: (_error, _events, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
