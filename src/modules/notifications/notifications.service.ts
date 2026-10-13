import 'server-only';
import { render } from '@react-email/render';
import type { ObjectId } from 'mongodb';
import type { ReactElement } from 'react';
import { deliverEmail, fromLine } from '@/lib/email';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { DAY, quotaLeft, takeQuota } from '@/lib/rate-limit';
import { insertEmailLog } from './notifications.repository';
import type { EmailTemplate } from './notifications.types';

// Sending email (architecture §9.1): render a template, deliver it through Resend, and log the
// outcome (database-design §7.11). Every email, direct or queued, passes through here, so this is
// also where the daily email limit (Resend's, per UTC day) is counted.

const dailyKey = (now: Date) => `email:daily:${now.toISOString().slice(0, 10)}`;

/** Emails the app can still send today, and when the count resets. */
export function dailyEmailsLeft(now = new Date()) {
  return quotaLeft(dailyKey(now), getEnv().EMAIL_DAILY_LIMIT, DAY, now);
}

/** Today's email limit is used up; queued emails should wait until `resetAt`. */
export class DailyEmailLimitError extends Error {
  constructor(readonly resetAt: Date) {
    super('Daily email limit reached');
  }
}

export interface EmailMessage {
  template: EmailTemplate;
  to: string;
  subject: string;
  /** A React Email template from `src/emails/`. */
  body: ReactElement;
  /** Shown before "via Make My Marriage" in the From line, e.g. the inviter's name. */
  fromName?: string;
  replyTo?: string;
  weddingId?: ObjectId | null;
  userId?: ObjectId | null;
  householdId?: ObjectId | null;
  /** The queued job sending it (bulk email). */
  jobId?: ObjectId | null;
  /** Same key → Resend sends at most once (e.g. a retried request). */
  idempotencyKey?: string;
}

/**
 * Send one email. Never throws for a delivery problem: it returns `'failed'` so the caller can
 * fall back (e.g. show the invite link to copy). Over the daily limit it's `'failed'` too.
 * Bodies and links are never logged or stored.
 */
export async function sendEmail(
  message: EmailMessage,
  now = new Date(),
): Promise<'sent' | 'failed'> {
  const outcome = await attemptEmail(message, now);
  return outcome === 'sent' ? 'sent' : 'failed';
}

/**
 * Send one queued email (the job queue). Throws `DailyEmailLimitError` when today's limit is
 * used up, so the job can wait without using an attempt, and an `Error` when delivery failed,
 * so it's retried.
 */
export async function sendQueuedEmail(message: EmailMessage, now = new Date()): Promise<void> {
  const outcome = await attemptEmail(message, now);
  if (outcome instanceof DailyEmailLimitError) throw outcome;
  if (outcome === 'failed') throw new Error('Email could not be sent');
}

async function attemptEmail(
  message: EmailMessage,
  now: Date,
): Promise<'sent' | 'failed' | DailyEmailLimitError> {
  const base = {
    weddingId: message.weddingId ?? null,
    userId: message.userId ?? null,
    householdId: message.householdId ?? null,
    jobId: message.jobId ?? null,
    to: message.to,
    template: message.template,
    now,
  };
  const quota = await takeQuota(dailyKey(now), getEnv().EMAIL_DAILY_LIMIT, DAY, now);
  if (!quota.allowed) {
    logger.warn('email.daily_limit_reached', { template: message.template });
    return new DailyEmailLimitError(quota.resetAt);
  }

  let providerMessageId: string;
  try {
    const [html, text] = await Promise.all([
      render(message.body),
      render(message.body, { plainText: true }),
    ]);
    providerMessageId = await deliverEmail(
      {
        from: fromLine(message.fromName),
        to: message.to,
        subject: message.subject,
        html,
        text,
        replyTo: message.replyTo,
      },
      message.idempotencyKey,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('email.failed', { template: message.template, error: reason });
    await insertEmailLog({
      ...base,
      status: 'failed',
      providerMessageId: null,
      error: reason,
    }).catch((logError: unknown) => logger.error('email.log_failed', { err: logError }));
    return 'failed';
  }
  // Delivered: a problem writing the log must not make the caller retry and send it twice.
  await insertEmailLog({ ...base, status: 'sent', providerMessageId, error: null }).catch(
    (logError: unknown) => logger.error('email.log_failed', { err: logError }),
  );
  return 'sent';
}
