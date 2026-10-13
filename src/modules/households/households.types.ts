import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type {
  bulkHouseholdsSchema,
  createHouseholdSchema,
  householdSideSchema,
  listHouseholdsQuerySchema,
  updateHouseholdSchema,
} from './households.schemas';

export type HouseholdSide = z.output<typeof householdSideSchema>;
export type CreateHouseholdInput = z.output<typeof createHouseholdSchema>;
export type UpdateHouseholdInput = z.output<typeof updateHouseholdSchema>;
export type ListHouseholdsQuery = z.output<typeof listHouseholdsQuerySchema>;
export type BulkHouseholdsInput = z.output<typeof bulkHouseholdsSchema>;

export type InviteStatus = 'not_sent' | 'queued' | 'sent' | 'sent_manually' | 'failed';
export type ResponseStatus = 'none' | 'partial' | 'complete';

export interface RsvpDocument {
  eventId: ObjectId;
  status: 'attending' | 'declined';
  attendingCount: number;
  note?: string;
  recordedBy: 'guest' | 'host';
  recordedByUserId?: ObjectId;
  respondedAt: Date;
  updatedAt: Date;
}

/** `households` collection (database-design §7.5): one invited family or group. */
export interface HouseholdDocument {
  _id: ObjectId;
  weddingId: ObjectId;
  displayName: string;
  members: { name: string }[];
  headcount: number;
  email: string | null;
  phone: string | null;
  side: HouseholdSide | null;
  tags: string[];
  notes: string;
  /** Lowercased name, members, email and phone, for search. */
  searchText: string;
  /** The personal invitation link (stored raw on purpose, so the couple can copy it again). */
  token: string;
  invitedEvents: { eventId: ObjectId; headcount: number }[];
  rsvps: RsvpDocument[];
  archivedRsvps: (RsvpDocument & { eventNameSnapshot: string; archivedAt: Date })[];
  inviteStatus: InviteStatus;
  sentAt: Date | null;
  openedAt: Date | null;
  responseStatus: ResponseStatus;
  emailBounced: boolean;
  lastRemindedAt: Date | null;
  reminderCount: number;
  remindersOptOut: boolean;
  importBatchId: string | null;
  createdByUserId: ObjectId;
  /** The last person to create or change it, and when (not cleanups). */
  editedByUserId: ObjectId;
  editedAt: Date;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

export interface HouseholdPerson {
  userId: string;
  name: string;
}

/** A family as the API returns it (api-spec §4.6). */
export interface Household {
  id: string;
  displayName: string;
  members: { name: string }[];
  headcount: number;
  email: string | null;
  phone: string | null;
  side: HouseholdSide | null;
  tags: string[];
  notes: string;
  invitedEvents: { eventId: string; headcount: number }[];
  rsvps: { eventId: string; status: 'attending' | 'declined'; attendingCount: number }[];
  inviteStatus: InviteStatus;
  responseStatus: ResponseStatus;
  createdBy: HouseholdPerson | null;
  editedBy: HouseholdPerson | null;
  editedAt: string;
  createdAt: string;
}

/** Totals for the header and event cards (api-spec §9.15), within the caller's side. */
export interface HouseholdSummary {
  households: number;
  people: number;
  events: { eventId: string; households: number; people: number }[];
  /** The side the caller is limited to, or `null` when they see everyone. */
  sideScope: HouseholdSide | null;
}

export interface PossibleDuplicate {
  id: string;
  displayName: string;
  side: HouseholdSide | null;
  /** What matched. */
  reason: 'phone' | 'email' | 'name';
}

export interface HouseholdImportResult {
  importBatchId: string | null;
  created: number;
  failed: number;
  valid: number;
  errors: { row: number; path: string; message: string }[];
  possibleDuplicates: { row: number; existingHouseholdId: string }[];
  duplicateRows: { row: number; matchesRow: number }[];
}
