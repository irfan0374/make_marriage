import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const EXPENSES = 'expenses';

// database-design §7.7.
export const expensesCollectionSpecs: CollectionSpec[] = [
  {
    collection: EXPENSES,
    indexes: [
      // The list, newest first.
      { key: { weddingId: 1, date: -1, _id: -1 } },
      // Category filter and totals.
      { key: { weddingId: 1, category: 1 } },
      // Event filter, and the event delete cleanup.
      { key: { weddingId: 1, eventId: 1 } },
      // What's been paid to a vendor.
      { key: { weddingId: 1, vendorId: 1 } },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'weddingId',
          'amountPaise',
          'date',
          'category',
          'description',
          'paidBy',
          'createdByUserId',
          'schemaVersion',
          'createdAt',
        ],
        properties: {
          weddingId: { bsonType: 'objectId' },
          amountPaise: { bsonType: ['long', 'int', 'double'], minimum: 100 },
          date: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          category: { bsonType: 'string', minLength: 1, maxLength: 40 },
          description: { bsonType: 'string', minLength: 1, maxLength: 200 },
          paidBy: { bsonType: 'object', required: ['type', 'name'] },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
