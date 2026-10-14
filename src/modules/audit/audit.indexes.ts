import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const AUDIT_LOGS = 'auditLogs';

// database-design §7.13.
export const auditCollectionSpecs: CollectionSpec[] = [
  {
    collection: AUDIT_LOGS,
    indexes: [
      // A wedding's activity, newest first.
      { key: { weddingId: 1, at: -1 } },
      // Removed 24 months later.
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'weddingId',
          'actor',
          'action',
          'targetType',
          'at',
          'expiresAt',
          'schemaVersion',
        ],
        properties: {
          weddingId: { bsonType: 'objectId' },
          actor: { bsonType: 'object', required: ['type'] },
          action: { bsonType: 'string' },
          targetType: { bsonType: 'string' },
          at: { bsonType: 'date' },
          expiresAt: { bsonType: 'date' },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
