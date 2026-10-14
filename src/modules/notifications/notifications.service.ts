import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { render } from '@react-email/render';
import type { ObjectId } from 'mongodb';
import type { ReactElement } from 'react';
import { deliverEmail, fromLine } from '@/lib/email';
import { getEnv, requireEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { DAY, quotaLeft, takeQuota } from '@/lib/rate-limit';
import {
  applyDeliveryEvent,
  findEmailLogByProviderId,
  insertEmailLog,
} from './notifications.repository';
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
export async function sendQueuedEmail(
  message: EmailMessage,
  now = new Date(),
  options: QueuedSendOptions = {},
): Promise<void> {
  const outcome = await attemptEmail(message, now, options.beforeSend);
  if (outcome instanceof DailyEmailLimitError) throw outcome;
  if (outcome === 'failed') throw new Error('Email could not be sent');
}

export interface QueuedSendOptions {
  /**
   * Runs once today's limit allows the send and just before the provider is called, e.g. to
   * save exactly what this attempt sends. Not run when the send is put off.
   */
  beforeSend?: () => Promise<void>;
}

async function attemptEmail(
  message: EmailMessage,
  now: Date,
  beforeSend?: () => Promise<void>,
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
  await beforeSend?.();

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

// Delivery webhooks from Resend (api-spec §21.3). Resend signs them the Svix way: an HMAC-SHA256
// of `id.timestamp.body` with the endpoint's secret (`whsec_` + base64), sent as `v1,<base64>`.

const WEBHOOK_TOLERANCE_MS = 5 * 60_000;
const DELIVERY_EVENTS = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
} as const;

/** A verified delivery event, and the email it's about (from our log). */
export interface DeliveryEvent {
  emailId: string;
  status: 'delivered' | 'bounced' | 'complained';
  at: Date;
  /** Our log of the email: who it went to and which wedding and family. */
  email: {
    template: EmailTemplate;
    to: string;
    weddingId: ObjectId | null;
    householdId: ObjectId | null;
  };
}

/** Check a webhook's signature; throws 401 INVALID_SIGNATURE if it isn't Resend's. */
export function verifyResendWebhook(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  now = new Date(),
): void {
  const { RESEND_WEBHOOK_SECRET: secret } = requireEnv('RESEND_WEBHOOK_SECRET');
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) throw new AppError('INVALID_SIGNATURE');
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(now.getTime() - sentAt) > WEBHOOK_TOLERANCE_MS) {
    throw new AppError('INVALID_SIGNATURE');
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  const matches = signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matches) throw new AppError('INVALID_SIGNATURE');
}

/**
 * Read a verified webhook: the delivery event and the email it's about, or `null` for event
 * types we don't track or emails we don't know (still a 200, so Resend doesn't retry). Changes
 * nothing, so the caller can apply its effects first and record the event last.
 */
export async function readResendWebhook(
  body: string,
  now = new Date(),
): Promise<DeliveryEvent | null> {
  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Webhook body must be JSON.');
  }
  const status = DELIVERY_EVENTS[event.type as keyof typeof DELIVERY_EVENTS];
  const emailId = event.data?.email_id;
  if (!status || typeof emailId !== 'string') return null;
  const log = await findEmailLogByProviderId(emailId);
  if (!log) return null;
  const at =
    event.created_at && !Number.isNaN(Date.parse(event.created_at))
      ? new Date(event.created_at)
      : now;
  return {
    emailId,
    status,
    at,
    email: {
      template: log.template,
      to: log.to,
      weddingId: log.weddingId,
      householdId: log.householdId,
    },
  };
}

/** Record a delivery event on its email's log (status and history). */
export async function recordDeliveryEvent(event: DeliveryEvent): Promise<void> {
  await applyDeliveryEvent(event.emailId, event.status, event.at);
  logger.info('email.delivery_event', { template: event.email.template, status: event.status });
}
