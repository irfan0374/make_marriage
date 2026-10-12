import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const EVENTS = 'events';

// database-design §7.4.
export const eventsCollectionSpecs: CollectionSpec[] = [
  {
    collection: EVENTS,
    indexes: [
      // The event list and timeline.
      { key: { weddingId: 1, order: 1 } },
      // Upcoming events on the dashboard.
      { key: { weddingId: 1, date: 1, startTime: 1 } },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'weddingId',
          'name',
          'presetKey',
          'date',
          'startTime',
          'showOnWebsite',
          'order',
          'schemaVersion',
          'createdAt',
        ],
        properties: {
          weddingId: { bsonType: 'objectId' },
          name: { bsonType: 'string', minLength: 1, maxLength: 60 },
          presetKey: {
            enum: ['engagement', 'mehendi', 'haldi', 'sangeet', 'wedding', 'reception', 'custom'],
          },
          date: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          startTime: { bsonType: 'string', pattern: '^\\d{2}:\\d{2}$' },
          endTime: { bsonType: ['string', 'null'] },
          mapUrl: { bsonType: ['string', 'null'] },
          showOnWebsite: { bsonType: 'bool' },
          order: { bsonType: 'int', minimum: 0 },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
