import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const VENDORS = 'vendors';

/** Case-insensitive English ordering for vendor names. */
export const NAME_COLLATION = { locale: 'en', strength: 2 } as const;

// database-design §7.8.
export const vendorsCollectionSpecs: CollectionSpec[] = [
  {
    collection: VENDORS,
    indexes: [
      // The vendor list with its filters.
      { key: { weddingId: 1, category: 1, status: 1 } },
      // Vendors for an event, and the event delete cleanup.
      { key: { weddingId: 1, eventIds: 1 } },
      // The same Google place is never saved twice (Find nearby, later).
      {
        key: { weddingId: 1, placeId: 1 },
        unique: true,
        partialFilterExpression: { placeId: { $type: 'string' } },
      },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'weddingId',
          'name',
          'category',
          'status',
          'eventIds',
          'attachments',
          'source',
          'createdByUserId',
          'schemaVersion',
          'createdAt',
        ],
        properties: {
          weddingId: { bsonType: 'objectId' },
          name: { bsonType: 'string', minLength: 1, maxLength: 120 },
          status: { enum: ['shortlisted', 'booked', 'completed'] },
          eventIds: { bsonType: 'array', maxItems: 50 },
          attachments: { bsonType: 'array', maxItems: 10 },
          contractAmountPaise: { bsonType: ['long', 'int', 'double', 'null'] },
          source: { enum: ['manual', 'google'] },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
