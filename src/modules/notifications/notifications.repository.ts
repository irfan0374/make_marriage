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
    jobId: null,
    householdId: null,
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
