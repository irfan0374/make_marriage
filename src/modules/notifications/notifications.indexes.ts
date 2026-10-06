import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const EMAIL_LOGS = 'emailLogs';

// database-design §7.11.
export const notificationsCollectionSpecs: CollectionSpec[] = [
  {
    collection: EMAIL_LOGS,
    indexes: [
      // Webhook updates (delivered, bounced) find the log by Resend's id.
      {
        key: { providerMessageId: 1 },
        unique: true,
        partialFilterExpression: { providerMessageId: { $type: 'string' } },
      },
      { key: { weddingId: 1, householdId: 1, createdAt: -1 } },
      { key: { weddingId: 1, status: 1 } },
      // Kept for 12 months.
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['to', 'template', 'status', 'expiresAt', 'schemaVersion', 'createdAt'],
        properties: {
          to: { bsonType: 'string' },
          template: { bsonType: 'string' },
          status: { enum: ['sent', 'delivered', 'bounced', 'complained', 'failed'] },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
