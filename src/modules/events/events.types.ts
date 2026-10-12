import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type {
  addPresetEventsSchema,
  createEventSchema,
  eventPresetKeySchema,
  updateEventSchema,
} from './events.schemas';

export type CreateEventInput = z.output<typeof createEventSchema>;
export type UpdateEventInput = z.output<typeof updateEventSchema>;
export type AddPresetEventsInput = z.output<typeof addPresetEventsSchema>;
export type EventPresetKey = z.output<typeof eventPresetKeySchema>;

/** `events` collection (database-design §7.4). */
export interface EventDocument {
  _id: ObjectId;
  weddingId: ObjectId;
  name: string;
  presetKey: EventPresetKey;
  /** `YYYY-MM-DD` in the wedding's timezone. */
  date: string;
  /** `HH:mm`. */
  startTime: string;
  /** `HH:mm`; earlier than `startTime` means the event runs past midnight. */
  endTime: string | null;
  venueName: string;
  address: string;
  mapUrl: string | null;
  dressCode: string;
  notes: string;
  showOnWebsite: boolean;
  /** Display order, from 0. */
  order: number;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

/** An event as the API returns it. Named so it can't be confused with the DOM's `Event`. */
export interface WeddingEvent {
  id: string;
  name: string;
  presetKey: EventPresetKey;
  date: string;
  startTime: string;
  endTime: string | null;
  venueName: string;
  address: string;
  mapUrl: string | null;
  dressCode: string;
  notes: string;
  showOnWebsite: boolean;
  order: number;
}

/** `meta` of PATCH: whether to offer the "event updated" email (api-spec §8.4, §10.8). */
export interface EventChangeMeta {
  guestFacingChange: boolean;
  affectedHouseholds: number;
}
