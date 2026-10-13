import type { z } from 'zod';
import type {
  remindFamiliesSchema,
  sendInvitationsSchema,
  updateInvitationSchema,
} from './invitations.schemas';

export type UpdateInvitationInput = z.output<typeof updateInvitationSchema>;
export type SendInvitationsInput = z.output<typeof sendInvitationsSchema>;
export type RemindFamiliesInput = z.output<typeof remindFamiliesSchema>;

/** What a send or reminder will do, or did (api-spec §10.4, §10.7). */
export interface SendResult {
  /** `null` for a dry run, or when nobody could be emailed. */
  batchId: string | null;
  /** Families emailed (or that would be, for a dry run). */
  queued: number;
  skippedNoEmail: number;
  /** Already sent (invitations without `resend`). */
  skippedAlreadySent: number;
  /** Already waiting in an earlier send. */
  skippedQueued: number;
  skippedNoEvents: number;
  /** Reminders only: replied to everything, asked not to be reminded, or not invited yet. */
  skippedNotNeeded: number;
  /** Days the send takes at the daily email limit (1 = today). */
  estimatedDays: number;
}

export interface InvitationMedia {
  type: 'image';
  /** Short-lived signed URL. */
  url: string;
  sizeBytes: number;
}

/** The couple's invitation settings (api-spec §10.1). */
export interface InvitationSettings {
  media: (InvitationMedia & { key: string }) | null;
  message: string;
  rsvpDeadline: string | null;
  autoRemindersEnabled: boolean;
  /** Last day a deadline may be set to: the last event's date, or the wedding date. */
  latestDeadline: string;
}

export interface PublicInvitationEvent {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string | null;
  venueName: string;
  address: string;
  mapUrl: string | null;
  dressCode: string;
  notes: string;
  /** People invited from this family for this event. */
  maxHeadcount: number;
  rsvp: { status: 'attending' | 'declined'; attendingCount: number; note: string } | null;
}

/** What a guest sees on their personal page (api-spec §11.1). */
export interface PublicInvitation {
  wedding: {
    brideName: string;
    groomName: string;
    weddingDate: string;
    city: string;
    venue: string;
  };
  household: { displayName: string; members: { name: string }[] };
  invitation: { media: { type: 'image'; url: string } | null; message: string };
  rsvpDeadline: string | null;
  rsvpOpen: boolean;
  /** Why replies are closed, when they are. */
  closedReason: 'deadline' | 'archived' | null;
  /** The family gets reminder emails and can turn them off. */
  canStopReminders: boolean;
  events: PublicInvitationEvent[];
  websiteUrl: string | null;
}
