import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const JOBS = 'jobs';

// database-design §7.10.
export const jobsCollectionSpecs: CollectionSpec[] = [
  {
    collection: JOBS,
    indexes: [
      // Claiming due jobs.
      { key: { status: 1, runAfter: 1 } },
      // Recovering jobs from a run that crashed mid-way.
      {
        key: { status: 1, lockedUntil: 1 },
        partialFilterExpression: { status: 'processing' },
      },
      // The same email is never queued twice.
      { key: { idempotencyKey: 1 }, unique: true },
      // Send progress on the invitations screen.
      { key: { weddingId: 1, batchId: 1, status: 1 } },
      // Finished jobs are removed 30 days later.
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'type',
          'status',
          'payload',
          'idempotencyKey',
          'attempts',
          'maxAttempts',
          'runAfter',
          'schemaVersion',
          'createdAt',
        ],
        properties: {
          weddingId: { bsonType: ['objectId', 'null'] },
          type: { bsonType: 'string' },
          status: { enum: ['queued', 'processing', 'done', 'skipped', 'failed', 'cancelled'] },
          payload: { bsonType: 'object' },
          idempotencyKey: { bsonType: 'string' },
          attempts: { bsonType: 'int', minimum: 0 },
          maxAttempts: { bsonType: 'int', minimum: 1 },
          lastError: { bsonType: ['string', 'null'], maxLength: 1000 },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
