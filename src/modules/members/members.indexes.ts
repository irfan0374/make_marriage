import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const MEMBERSHIPS = 'memberships';

// database-design §7.2.
export const membersCollectionSpecs: CollectionSpec[] = [
  {
    collection: MEMBERSHIPS,
    indexes: [
      // Membership check on every private request; one membership per user per wedding.
      { key: { weddingId: 1, userId: 1 }, unique: true },
      // "My weddings" list and the wedding switcher.
      { key: { userId: 1 } },
      // Admin count and the team list.
      { key: { weddingId: 1, role: 1 } },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'weddingId',
          'userId',
          'role',
          'sideScope',
          'joinedAt',
          'schemaVersion',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          weddingId: { bsonType: 'objectId' },
          userId: { bsonType: 'objectId' },
          role: { enum: ['admin', 'manager'] },
          sideScope: { enum: ['bride', 'groom', 'both'] },
          invitedByUserId: { bsonType: ['objectId', 'null'] },
          joinedAt: { bsonType: 'date' },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
