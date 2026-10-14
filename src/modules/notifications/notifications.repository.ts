import 'server-only';
import { ObjectId } from 'mongodb';
import { globalCollection } from '@/lib/db/client';
import { EMAIL_LOGS } from './notifications.indexes';
import type { EmailLogDocument, EmailStatus, EmailTemplate } from './notifications.types';

// Email logs are tenant or system records (account emails have no wedding), so this is a global
// collection. Entries are only ever written here, never read back by guests or members.

const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export async function insertEmailLog(input: {
  weddingId: ObjectId | null;
  userId: ObjectId | null;
  householdId: ObjectId | null;
  jobId: ObjectId | null;
  to: string;
  template: EmailTemplate;
  status: Extract<EmailStatus, 'sent' | 'failed'>;
  providerMessageId: string | null;
  error: string | null;
  now: Date;
}): Promise<void> {
  const doc: EmailLogDocument = {
    _id: new ObjectId(),
    weddingId: input.weddingId,
    jobId: input.jobId,
    householdId: input.householdId,
    userId: input.userId,
    to: input.to,
    template: input.template,
    status: input.status,
    providerMessageId: input.providerMessageId,
    error: input.error?.slice(0, 1000) ?? null,
    sentAt: input.status === 'sent' ? input.now : null,
    statusHistory: [{ status: input.status, at: input.now }],
    expiresAt: new Date(input.now.getTime() + RETENTION_MS),
    schemaVersion: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
  await globalCollection<EmailLogDocument>(EMAIL_LOGS).insertOne(doc);
}

/** Record a delivery event from the provider's webhook on the email's log (last 10 kept). */
export async function applyDeliveryEvent(
  providerMessageId: string,
  status: Extract<EmailStatus, 'delivered' | 'bounced' | 'complained'>,
  at: Date,
) {
  await globalCollection<EmailLogDocument>(EMAIL_LOGS).updateOne({ providerMessageId }, [
    {
      $set: {
        // A bounce or complaint is never replaced by a later "delivered".
        status: {
          $cond: [
            {
              $and: [
                { $eq: [status, 'delivered'] },
                { $in: ['$status', ['bounced', 'complained']] },
              ],
            },
            '$status',
            status,
          ],
        },
        statusHistory: {
          $slice: [{ $concatArrays: ['$statusHistory', [{ status, at }]] }, -10],
        },
        updatedAt: at,
      },
    },
  ]);
}

/** The log of one sent email, by the provider's id. */
export function findEmailLogByProviderId(providerMessageId: string) {
  return globalCollection<EmailLogDocument>(EMAIL_LOGS).findOne({ providerMessageId });
}
