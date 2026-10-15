import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const PHOTOS = 'photos';

// database-design §7.9.
export const galleryCollectionSpecs: CollectionSpec[] = [
  {
    collection: PHOTOS,
    indexes: [
      // The guest gallery: ready, not hidden, newest first.
      { key: { weddingId: 1, status: 1, hidden: 1, _id: -1 } },
      // An album, and moving an event's photos to General when it's deleted.
      { key: { weddingId: 1, albumEventId: 1, status: 1, _id: -1 } },
      // The daily clean-up of uploads that were never confirmed.
      {
        key: { status: 1, createdAt: 1 },
        partialFilterExpression: { status: 'pending' },
      },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'weddingId',
          'albumEventId',
          'displayKey',
          'thumbKey',
          'width',
          'height',
          'reservedBytes',
          'status',
          'hidden',
          'uploadBatchId',
          'schemaVersion',
          'createdAt',
        ],
        properties: {
          weddingId: { bsonType: 'objectId' },
          albumEventId: { bsonType: ['objectId', 'null'] },
          uploaderName: { bsonType: ['string', 'null'], maxLength: 60 },
          contentType: { enum: ['image/webp', 'image/jpeg'] },
          status: { enum: ['pending', 'ready'] },
          hidden: { bsonType: 'bool' },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
