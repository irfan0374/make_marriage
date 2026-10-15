import type { ObjectId } from 'mongodb';

/** Who did it: a team member, a guest through their link, or the app itself. */
export type AuditActor =
  | { type: 'user'; userId: ObjectId }
  | { type: 'guest'; householdId: ObjectId }
  | { type: 'system' };

/** Actions recorded so far (database-design §7.13); more arrive with their features. */
export type AuditAction =
  | 'rsvp.submitted'
  | 'rsvp.recorded_by_host'
  | 'rsvp.cleared'
  | 'household.link_regenerated'
  | 'website.published'
  | 'website.unpublished';

/** `auditLogs` collection: sensitive changes, kept 24 months. Never tokens or personal records. */
export interface AuditLogDocument {
  _id: ObjectId;
  weddingId: ObjectId;
  actor: AuditActor;
  action: AuditAction;
  targetType: 'household' | 'event' | 'wedding';
  targetId: ObjectId | null;
  /** Small details, e.g. `{ eventId, before: 'attending:3', after: 'declined' }`. */
  meta: Record<string, unknown>;
  at: Date;
  expiresAt: Date;
  schemaVersion: 1;
}

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  targetType: AuditLogDocument['targetType'];
  targetId?: ObjectId | null;
  meta?: Record<string, unknown>;
}
