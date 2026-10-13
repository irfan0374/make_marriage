import 'server-only';
import { ObjectId, type AnyBulkWriteOperation, type ClientSession, type Filter } from 'mongodb';
import { globalCollection } from '@/lib/db/client';
import type { WeddingId } from '@/lib/ids';
import { JOBS } from './jobs.indexes';
import type { JobDocument, JobStatus, JobType, NewJob } from './jobs.types';

// The job queue holds wedding jobs and system jobs (no wedding), so it's a global collection.
// Every function about one wedding's jobs takes its id first and filters by it.

const jobs = () => globalCollection<JobDocument>(JOBS);

const LOCK_MS = 2 * 60_000;
const KEEP_FINISHED_MS = 30 * 24 * 60 * 60_000;

/**
 * Queue jobs for a wedding. A job whose idempotency key already exists is skipped, so queuing
 * the same email twice never sends it twice. Returns how many were added.
 */
export async function insertJobs(
  weddingId: WeddingId,
  batchId: string,
  newJobs: NewJob[],
  now: Date,
  session: ClientSession,
): Promise<number> {
  if (newJobs.length === 0) return 0;
  const operations: AnyBulkWriteOperation<JobDocument>[] = newJobs.map((job) => ({
    updateOne: {
      filter: { idempotencyKey: job.idempotencyKey },
      update: {
        $setOnInsert: {
          _id: new ObjectId(),
          weddingId,
          type: job.type,
          status: 'queued',
          payload: job.payload,
          batchId,
          idempotencyKey: job.idempotencyKey,
          attempts: 0,
          maxAttempts: 3,
          runAfter: now,
          lockedUntil: null,
          lastError: null,
          completedAt: null,
          expiresAt: null,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
      },
      upsert: true,
    },
  }));
  const result = await jobs().bulkWrite(operations, { session, ordered: false });
  return result.upsertedCount;
}

/**
 * Claim the next due job, or a job whose run crashed (its lock ran out), so two overlapping
 * runs never take the same job (database-design §7.10).
 */
export function claimNextJob(now: Date) {
  return jobs().findOneAndUpdate(
    {
      $or: [
        { status: 'queued', runAfter: { $lte: now } },
        { status: 'processing', lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        status: 'processing',
        lockedUntil: new Date(now.getTime() + LOCK_MS),
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { runAfter: 1 }, returnDocument: 'after', includeResultMetadata: false },
  );
}

function finished(status: JobStatus, now: Date) {
  return {
    status,
    lockedUntil: null,
    completedAt: now,
    expiresAt: new Date(now.getTime() + KEEP_FINISHED_MS),
    updatedAt: now,
  };
}

export async function markJobDone(jobId: ObjectId, now: Date): Promise<void> {
  await jobs().updateOne({ _id: jobId }, { $set: finished('done', now) });
}

export async function markJobSkipped(jobId: ObjectId, now: Date): Promise<void> {
  await jobs().updateOne({ _id: jobId }, { $set: finished('skipped', now) });
}

/** Remember what the first attempt sends, so retries send the same email. */
export async function saveJobSent(
  jobId: ObjectId,
  sent: Record<string, unknown>,
  now: Date,
): Promise<void> {
  await jobs().updateOne({ _id: jobId }, { $set: { sent, updatedAt: now } });
}

/** Families of this wedding with a job of `type` still waiting or running. */
export async function findActiveHouseholdIds(
  weddingId: WeddingId,
  type: JobType,
  session: ClientSession,
): Promise<Set<string>> {
  const ids = await jobs().distinct(
    'payload.householdId',
    { weddingId, type, status: { $in: ['queued', 'processing'] } },
    { session },
  );
  return new Set(ids.map((id: { toHexString?: () => string }) => id.toHexString?.() ?? String(id)));
}

export async function markJobFailed(jobId: ObjectId, error: string, now: Date): Promise<void> {
  await jobs().updateOne(
    { _id: jobId },
    { $set: { ...finished('failed', now), lastError: error.slice(0, 1000) } },
  );
}

/** Put a job back in the queue to run at `runAfter`. `undoAttempt` when it never really ran. */
export async function requeueJob(
  jobId: ObjectId,
  runAfter: Date,
  now: Date,
  { error, undoAttempt = false }: { error?: string; undoAttempt?: boolean } = {},
): Promise<void> {
  await jobs().updateOne(
    { _id: jobId },
    {
      $set: {
        status: 'queued',
        runAfter,
        lockedUntil: null,
        updatedAt: now,
        ...(error ? { lastError: error.slice(0, 1000) } : {}),
      },
      ...(undoAttempt ? { $inc: { attempts: -1 } } : {}),
    },
  );
}

/** Only the caller's side's jobs: each job records its family's side. */
function batchFilter(
  weddingId: WeddingId,
  side: string | null,
  extra: Filter<JobDocument> = {},
): Filter<JobDocument> {
  return { weddingId, ...(side ? { 'payload.side': side } : {}), ...extra };
}

/** Counts per batch and status for this wedding's recent batches, newest first. */
export function countBatches(
  weddingId: WeddingId,
  side: string | null,
  { batchId, since, types }: { batchId?: string; since?: Date; types: JobType[] },
) {
  return jobs()
    .aggregate<{
      _id: string;
      type: JobType;
      createdAt: Date;
      statuses: { status: JobStatus; count: number }[];
    }>([
      {
        $match: batchFilter(weddingId, side, {
          type: { $in: types },
          batchId: batchId ?? { $ne: null },
          ...(since ? { createdAt: { $gte: since } } : {}),
        }),
      },
      {
        $group: {
          _id: { batchId: '$batchId', status: '$status' },
          type: { $first: '$type' },
          createdAt: { $min: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.batchId',
          type: { $first: '$type' },
          createdAt: { $min: '$createdAt' },
          statuses: { $push: { status: '$_id.status', count: '$count' } },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
    ])
    .toArray();
}

/** Cancel a batch's jobs that haven't started; returns them so their effects can be undone. */
export async function cancelQueuedJobs(
  weddingId: WeddingId,
  side: string | null,
  batchId: string,
  now: Date,
  session: ClientSession,
): Promise<JobDocument[]> {
  const filter = batchFilter(weddingId, side, { batchId, status: 'queued' });
  const pending = await jobs().find(filter, { session }).toArray();
  if (pending.length === 0) return [];
  await jobs().updateMany(
    { _id: { $in: pending.map((job) => job._id) }, status: 'queued' },
    { $set: finished('cancelled', now) },
    { session },
  );
  return pending;
}
