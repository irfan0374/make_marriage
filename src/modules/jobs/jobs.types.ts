import type { ObjectId } from 'mongodb';

/** Job types with a handler today (database-design §7.10); more arrive with their features. */
export type JobType = 'invitation.send' | 'rsvp.remind' | 'event.updated_notice' | 'task.remind';

/** `skipped`: ran, but there was nothing to do (e.g. the family replied meanwhile). */
export type JobStatus = 'queued' | 'processing' | 'done' | 'skipped' | 'failed' | 'cancelled';

/** `jobs` collection: the background queue for bulk email (architecture §9.2–9.3). */
export interface JobDocument {
  _id: ObjectId;
  /** `null` for system jobs. */
  weddingId: ObjectId | null;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  /**
   * What the first attempt sent (recipient, subject and the email's details), so a retry sends
   * exactly the same email under the same idempotency key.
   */
  sent?: Record<string, unknown> | null;
  /** Groups the jobs of one "Send invitations" action, for progress. */
  batchId: string | null;
  /** Unique: the same email is never queued twice. */
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedUntil: Date | null;
  lastError: string | null;
  completedAt: Date | null;
  /** `completedAt + 30 days` once finished, for TTL cleanup. */
  expiresAt: Date | null;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewJob {
  type: JobType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

/** What happened in one run of the queue (api-spec §21.1). */
export interface ProcessJobsResult {
  claimed: number;
  done: number;
  /** Ran without sending, e.g. the family replied or was deleted meanwhile. */
  skipped: number;
  /** Put off until later, e.g. today's email limit is used up. */
  deferred: number;
  retried: number;
  failed: number;
  durationMs: number;
}

/** Per-status counts of one batch, limited to the caller's side. */
export interface BatchCounts {
  batchId: string;
  type: JobType;
  total: number;
  /** Still to send, including any being sent right now. */
  waiting: number;
  sent: number;
  /** Not needed any more when their turn came (e.g. replied meanwhile). */
  skipped: number;
  failed: number;
  cancelled: number;
  createdAt: string;
}
