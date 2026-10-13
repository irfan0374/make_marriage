import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { getEnv } from '@/lib/env';
import { invitationJobHandlers } from '@/modules/invitations';
import { processJobs, type ProcessJobsResult } from '@/modules/jobs';
import { dailyEmailsLeft } from '@/modules/notifications';
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
