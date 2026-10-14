import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { getEnv } from '@/lib/env';
import { recordEmailBounced, recordEmailComplaint } from '@/modules/households';
import { invitationJobHandlers, queueAutomaticReminders } from '@/modules/invitations';
import { processJobs, type ProcessJobsResult } from '@/modules/jobs';
import {
  dailyEmailsLeft,
  readResendWebhook,
  recordDeliveryEvent,
  verifyResendWebhook,
} from '@/modules/notifications';
import { trustWeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { pingDatabase } from './system.repository';
import type { Health } from './system.types';

export async function getHealth(): Promise<Health> {
  const time = new Date().toISOString();
  try {
    await pingDatabase();
    return { status: 'ok', db: 'ok', time };
  } catch (error) {
    logger.error('health.db_unreachable', { err: error });
    return { status: 'error', db: 'down', time };
  }
}

/** Cron calls carry `Authorization: Bearer <CRON_SECRET>` (architecture §9.4). */
function assertCronSecret(authorization: string | null): void {
  const expected = Buffer.from(`Bearer ${getEnv().CRON_SECRET}`);
  const given = Buffer.from(authorization ?? '');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new AppError('INVALID_SIGNATURE');
  }
}

/** POST /api/cron/process-jobs (api-spec §21.1): one short run of the job queue. */
export async function runJobQueue(
  authorization: string | null,
): Promise<ProcessJobsResult & { dailyEmailRemaining: number }> {
  assertCronSecret(authorization);
  const result = await processJobs(invitationJobHandlers);
  if (result.claimed > 0 || result.deferred > 0) logger.info('jobs.run', { ...result });
  // Every email counts, sent here or straight from a request.
  return { ...result, dailyEmailRemaining: (await dailyEmailsLeft()).remaining };
}

/**
 * POST /api/webhooks/resend (api-spec §21.3): delivered, bounced and complained events. A bounce
 * flags the family's email; a complaint turns their reminders off. The family is updated first
 * and the email log last, and both are safe to repeat, so if anything fails Resend's retry
 * finishes the job. Unknown emails are ignored.
 */
export async function handleResendWebhook(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): Promise<{ applied: boolean }> {
  verifyResendWebhook(body, headers);
  const event = await readResendWebhook(body);
  if (!event) return { applied: false };
  const { weddingId, householdId, to } = event.email;
  if (weddingId && householdId) {
    // The log was written for this wedding's family, so its ids can be trusted.
    const wedding = trustWeddingId(weddingId);
    if (event.status === 'bounced') await recordEmailBounced(wedding, householdId, to);
    else if (event.status === 'complained') await recordEmailComplaint(wedding, householdId);
  }
  await recordDeliveryEvent(event);
  return { applied: true };
}

/**
 * POST /api/cron/daily (api-spec §21.2): the scheduled work, called every hour so each wedding
 * gets it at 9 AM in its own timezone. For now: automatic RSVP reminders. Safe to call twice.
 */
export async function runScheduledWork(authorization: string | null) {
  assertCronSecret(authorization);
  const result = await queueAutomaticReminders();
  if (result.rsvpRemindersQueued > 0) logger.info('cron.daily', result);
  return result;
}
