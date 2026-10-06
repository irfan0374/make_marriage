import type { ObjectId } from 'mongodb';

/** Every email the app sends (database-design §7.11). Templates are added as they're built. */
export type EmailTemplate = 'member_invite';

export type EmailStatus = 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed';

/** `emailLogs` collection: who, which template, and what happened. Never the email body. */
export interface EmailLogDocument {
  _id: ObjectId;
  weddingId: ObjectId | null;
  jobId: ObjectId | null;
  householdId: ObjectId | null;
  userId: ObjectId | null;
  to: string;
  template: EmailTemplate;
  status: EmailStatus;
  providerMessageId: string | null;
  error: string | null;
  sentAt: Date | null;
  statusHistory: { status: EmailStatus; at: Date }[];
  expiresAt: Date;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}
