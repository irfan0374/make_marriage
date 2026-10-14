import 'server-only';
import type { ClientSession, ObjectId } from 'mongodb';
import type { ReactElement } from 'react';
import type { WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { DAY } from '@/lib/rate-limit';
import { DailyEmailLimitError, sendQueuedEmail, type EmailMessage } from '@/modules/notifications';
import {
  cancelQueuedJobs,
  claimNextJob,
  countBatches,
  findActiveHouseholdIds,
  insertJobs,
  markJobDone,
  markJobFailed,
  markJobSkipped,
  requeueJob,
  saveJobSent,
} from './jobs.repository';
import type { BatchCounts, JobDocument, JobType, NewJob, ProcessJobsResult } from './jobs.types';

// The background queue (architecture §9.2–9.3): bulk email is queued here, and the cron route
// runs it in short runs. Handlers for each job type live with their feature and are passed in,
// so this module depends on nothing above it. The daily email limit is counted where emails are
// sent (notifications); a handler that hits it defers its job.

const BATCH_SIZE = 50;
const TIME_BUDGET_MS = 8_000;
/** Back-off after the 1st and 2nd failed attempts; the 3rd failure is final. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];

/** A job that can never succeed (e.g. the family has no email any more): fail without retrying. */
export class PermanentJobError extends Error {}

/**
 * Not now: put the job back until `runAfter` without using an attempt (e.g. today's email limit
 * is used up). The run stops there, since later jobs would wait too.
 */
export class DeferJobError extends Error {
  constructor(readonly runAfter: Date) {
    super('Deferred');
  }
}

export interface JobRunTools {
  /**
   * What the first attempt sends; later attempts get it back in `job.sent` and must send exactly
   * that, so the provider's idempotency key always matches the same email.
   */
  remember: (sent: Record<string, unknown>) => Promise<void>;
}

export interface JobHandler {
  /**
   * Do the work and say whether anything was sent: `'skipped'` when it was no longer needed.
   * Throw to retry later, `PermanentJobError` to give up, `DeferJobError` to wait.
   */
  run: (job: JobDocument, tools: JobRunTools) => Promise<'done' | 'skipped'>;
  /** Called once when the job finally fails, e.g. to mark the family's email as failed. */
  onFailed?: (job: JobDocument) => Promise<void>;
}

export type JobHandlers = Record<JobType, JobHandler>;

/** Queue jobs inside the caller's transaction; duplicates (same key) are skipped. */
export function enqueueJobs(
  weddingId: WeddingId,
  batchId: string,
  jobs: NewJob[],
  session: ClientSession,
  now = new Date(),
): Promise<number> {
  return insertJobs(weddingId, batchId, jobs, now, session);
}

/**
 * Families with a `type` job still waiting or running (optionally only jobs whose payload
 * matches, e.g. the same event), read in the caller's transaction.
 */
export function familiesWithPendingJobs(
  weddingId: WeddingId,
  type: JobType,
  session: ClientSession,
  payloadMatch?: Record<string, unknown>,
): Promise<Set<string>> {
  return findActiveHouseholdIds(weddingId, type, session, payloadMatch);
}

/**
 * POST /api/cron/process-jobs (api-spec §21.1): claim and run up to 50 due jobs, stopping after
 * about 8 seconds, or as soon as a job is deferred (e.g. the daily email limit is reached).
 */
export async function processJobs(
  handlers: JobHandlers,
  now: () => Date = () => new Date(),
): Promise<ProcessJobsResult> {
  const started = Date.now();
  const result: ProcessJobsResult = {
    claimed: 0,
    done: 0,
    skipped: 0,
    deferred: 0,
    retried: 0,
    failed: 0,
    durationMs: 0,
  };

  while (result.claimed < BATCH_SIZE && Date.now() - started < TIME_BUDGET_MS) {
    const job = await claimNextJob(now());
    if (!job) break;
    result.claimed++;
    const handler = handlers[job.type];
    const tools: JobRunTools = {
      remember: async (sent) => {
        job.sent = sent;
        await saveJobSent(job._id, sent, now());
      },
    };

    try {
      const outcome = await handler.run(job, tools);
      if (outcome === 'skipped') {
        await markJobSkipped(job._id, now());
        result.skipped++;
      } else {
        await markJobDone(job._id, now());
        result.done++;
      }
    } catch (error) {
      if (error instanceof DeferJobError) {
        await requeueJob(job._id, error.runAfter, now(), { undoAttempt: true });
        result.claimed--;
        result.deferred++;
        logger.info('jobs.deferred', { runAfter: error.runAfter.toISOString() });
        break;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      const final = error instanceof PermanentJobError || job.attempts >= job.maxAttempts;
      if (final) {
        await markJobFailed(job._id, message, now());
        await handler
          .onFailed?.(job)
          .catch((hookError: unknown) =>
            logger.error('jobs.on_failed_error', { jobId: job._id.toHexString(), err: hookError }),
          );
        result.failed++;
      } else {
        const delay = RETRY_DELAYS_MS[job.attempts - 1] ?? RETRY_DELAYS_MS.at(-1)!;
        await requeueJob(job._id, new Date(now().getTime() + delay), now(), { error: message });
        result.retried++;
      }
      logger.warn('jobs.failed_attempt', {
        jobId: job._id.toHexString(),
        type: job.type,
        attempt: job.attempts,
        final,
        error: message,
      });
    }
  }

  result.durationMs = Date.now() - started;
  return result;
}

function countsOf(batch: Awaited<ReturnType<typeof countBatches>>[number]): BatchCounts {
  const count = (...statuses: string[]) =>
    batch.statuses.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s.count, 0);
  return {
    batchId: batch._id,
    type: batch.type,
    total: count('queued', 'processing', 'done', 'skipped', 'failed', 'cancelled'),
    waiting: count('queued', 'processing'),
    sent: count('done'),
    skipped: count('skipped'),
    failed: count('failed'),
    cancelled: count('cancelled'),
    createdAt: batch.createdAt.toISOString(),
  };
}

/** One batch's progress, within the caller's side; `null` if there's no such batch. */
export async function getBatch(
  weddingId: WeddingId,
  side: string | null,
  batchId: string,
  types: JobType[],
): Promise<BatchCounts | null> {
  const [batch] = await countBatches(weddingId, side, { batchId, types });
  return batch ? countsOf(batch) : null;
}

/** This wedding's batches from the last 3 days, newest first (at most 5). */
export async function listRecentBatches(
  weddingId: WeddingId,
  side: string | null,
  types: JobType[],
  now = new Date(),
): Promise<BatchCounts[]> {
  const since = new Date(now.getTime() - 3 * DAY);
  return (await countBatches(weddingId, side, { since, types })).map(countsOf);
}

/** Cancel a batch's jobs that haven't started, in the caller's transaction. */
export function cancelBatchJobs(
  weddingId: WeddingId,
  side: string | null,
  batchId: string,
  session: ClientSession,
  now = new Date(),
): Promise<JobDocument[]> {
  return cancelQueuedJobs(weddingId, side, batchId, now, session);
}

/** The email a job sends, saved when its first attempt starts so every retry sends the same. */
export interface JobEmail<P> {
  to: string;
  subject: string;
  fromName: string;
  props: P;
}

/**
 * Send a job's email. A retry sends what an earlier attempt really tried to send, even if the
 * data changed meanwhile, so the provider's idempotency key always belongs to the same email.
 * Otherwise `build` makes it from the latest data, and it's saved only once today's email limit
 * lets the attempt start: a send put off until tomorrow is rebuilt then. The limit defers the job.
 */
export async function sendJobEmail<P extends object>(
  job: JobDocument,
  tools: JobRunTools,
  message: {
    template: EmailMessage['template'];
    render: (props: P) => ReactElement;
    build: () => JobEmail<P>;
    weddingId: WeddingId;
    householdId?: ObjectId;
    userId?: ObjectId;
  },
): Promise<void> {
  const saved = job.sent as JobEmail<P> | null | undefined;
  const email = saved ?? message.build();
  try {
    await sendQueuedEmail(
      {
        template: message.template,
        to: email.to,
        subject: email.subject,
        body: message.render(email.props),
        fromName: email.fromName,
        weddingId: message.weddingId,
        householdId: message.householdId ?? null,
        userId: message.userId ?? null,
        jobId: job._id,
        idempotencyKey: job.idempotencyKey,
      },
      new Date(),
      saved
        ? {}
        : { beforeSend: () => tools.remember(email as unknown as Record<string, unknown>) },
    );
  } catch (error) {
    if (error instanceof DailyEmailLimitError) throw new DeferJobError(error.resetAt);
    throw error;
  }
}
