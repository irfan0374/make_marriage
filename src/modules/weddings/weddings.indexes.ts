import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const WEDDINGS = 'weddings';

// database-design §7.1.
export const weddingsCollectionSpecs: CollectionSpec[] = [
  {
    collection: WEDDINGS,
    indexes: [
      // Public website lookup and slug availability. Partial: unset slugs don't collide.
      {
        key: { 'website.slug': 1 },
        unique: true,
        partialFilterExpression: { 'website.slug': { $type: 'string' } },
      },
      // Gallery token lookup.
      { key: { 'gallery.token': 1 }, unique: true },
      // Daily retention and reminder jobs.
      { key: { status: 1, weddingDate: 1 } },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'brideName',
          'groomName',
          'weddingDate',
          'city',
          'timezone',
          'sidesEnabled',
          'status',
          'createdByUserId',
          'invitation',
          'website',
          'gallery',
          'retention',
          'schemaVersion',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          brideName: { bsonType: 'string', minLength: 1, maxLength: 60 },
          groomName: { bsonType: 'string', minLength: 1, maxLength: 60 },
          weddingDate: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          city: { bsonType: 'string', minLength: 1, maxLength: 80 },
          venue: { bsonType: 'string', maxLength: 200 },
          timezone: { bsonType: 'string' },
          sidesEnabled: { bsonType: 'bool' },
          status: { enum: ['active', 'archived'] },
          createdByUserId: { bsonType: 'objectId' },
          gallery: {
            bsonType: 'object',
            required: ['token'],
            properties: { token: { bsonType: 'string', minLength: 22, maxLength: 22 } },
          },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
