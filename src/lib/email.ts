import 'server-only';
import { Resend } from 'resend';
import { APP_NAME } from '@/config/app';
import { getEnv } from '@/lib/env';

// Low-level email delivery through Resend (architecture §9.1). Modules send through the
// notifications module, which renders templates and logs every send; only it calls this.

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Resend refused or couldn't be reached. The message never contains the email itself. */
export class EmailDeliveryError extends Error {}

const globalForEmail = globalThis as typeof globalThis & {
  __resend?: Resend;
  __testOutbox?: OutgoingEmail[];
  __testEmailsFail?: boolean;
};

/**
 * Emails "sent" while NODE_ENV is test. Tests never reach Resend: they read this instead.
 * Cleared with `clearTestOutbox`.
 */
export function testOutbox(): OutgoingEmail[] {
  globalForEmail.__testOutbox ??= [];
  return globalForEmail.__testOutbox;
}

export function clearTestOutbox(): void {
  testOutbox().length = 0;
  globalForEmail.__testEmailsFail = false;
}

/** Tests only: make sending fail, as if Resend were down. */
export function failTestEmails(fail = true): void {
  globalForEmail.__testEmailsFail = fail;
}

/** The bare address in EMAIL_FROM ("Name <a@b.c>" or "a@b.c"). */
function senderAddress(): string {
  const from = getEnv().EMAIL_FROM;
  return /<([^<>]+)>/.exec(from)?.[1] ?? from;
}

/**
 * The From line, with a display name when given: `"Nafiya via Make My Marriage" <invites@…>`
 * (PRD open question 5: the couple's name, sent from the app's domain).
 */
export function fromLine(displayName?: string): string {
  if (!displayName) return getEnv().EMAIL_FROM;
  const name = `${displayName} via ${APP_NAME}`.replace(/["<>\r\n\\]/g, '').slice(0, 120);
  return `"${name}" <${senderAddress()}>`;
}

/** Deliver one email and return the provider's message id. */
export async function deliverEmail(email: OutgoingEmail, idempotencyKey?: string): Promise<string> {
  const env = getEnv();
  if (env.NODE_ENV === 'test') {
    if (globalForEmail.__testEmailsFail) throw new EmailDeliveryError('Test delivery failure');
    testOutbox().push(email);
    return `test_${testOutbox().length}`;
  }

  globalForEmail.__resend ??= new Resend(env.RESEND_API_KEY);
  const { data, error } = await globalForEmail.__resend.emails.send(
    {
      from: email.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  if (error || !data) throw new EmailDeliveryError(error?.message ?? 'Resend returned no id');
  return data.id;
}
