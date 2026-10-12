import type {
  AddPresetEventsInput,
  CreateEventInput,
  UpdateEventInput,
  WeddingEvent,
} from '@/modules/events/events.types';
import { apiFetch, postJson } from '@/shared/api-client';

const base = (weddingId: string) => `/api/weddings/${weddingId}/events`;

export const getEvents = (weddingId: string) => apiFetch<WeddingEvent[]>(base(weddingId));
export const createEvent = (weddingId: string, input: CreateEventInput) =>
  postJson<WeddingEvent>(base(weddingId), input);
export const addPresetEvents = (weddingId: string, input: AddPresetEventsInput) =>
  postJson<WeddingEvent[]>(`${base(weddingId)}/presets`, input);
export const updateEvent = (weddingId: string, eventId: string, input: UpdateEventInput) =>
  apiFetch<WeddingEvent>(`${base(weddingId)}/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const deleteEvent = (weddingId: string, eventId: string, confirm = false) =>
  apiFetch<void>(`${base(weddingId)}/${eventId}${confirm ? '?confirm=true' : ''}`, {
    method: 'DELETE',
  });
export const reorderEvents = (weddingId: string, eventIds: string[]) =>
  postJson<WeddingEvent[]>(`${base(weddingId)}/reorder`, { eventIds });
