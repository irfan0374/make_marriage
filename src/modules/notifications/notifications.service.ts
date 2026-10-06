import 'server-only';
import { render } from '@react-email/render';
import type { ObjectId } from 'mongodb';
import type { ReactElement } from 'react';
import { deliverEmail, fromLine } from '@/lib/email';
import { logger } from '@/lib/logger';
import { insertEmailLog } from './notifications.repository';
import type { EmailTemplate } from './notifications.types';

// Sending email (architecture §9.1): render a template, deliver it through Resend during the
// request, and log the outcome (database-design §7.11). Bulk sends will go through the job queue.

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
  /** Same key → Resend sends at most once (e.g. a retried request). */
  idempotencyKey?: string;
}

/**
 * Send one email. Never throws for a delivery problem: it returns `'failed'` so the caller can
 * fall back (e.g. show the invite link to copy). Bodies and links are never logged or stored.
 */
export async function sendEmail(
  message: EmailMessage,
  now = new Date(),
): Promise<'sent' | 'failed'> {
  const base = {
    weddingId: message.weddingId ?? null,
    userId: message.userId ?? null,
    to: message.to,
    template: message.template,
    now,
  };
  try {
    const [html, text] = await Promise.all([
      render(message.body),
      render(message.body, { plainText: true }),
    ]);
    const providerMessageId = await deliverEmail(
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
    await insertEmailLog({ ...base, status: 'sent', providerMessageId, error: null });
    return 'sent';
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
}
