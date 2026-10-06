import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const MEMBER_INVITES = 'memberInvites';

// database-design §7.3.
export const teamCollectionSpecs: CollectionSpec[] = [
  {
    collection: MEMBER_INVITES,
    indexes: [
      // Opening a /join link.
      { key: { tokenHash: 1 }, unique: true },
      // Only one pending invite per email per wedding.
      {
        key: { weddingId: 1, email: 1 },
        name: 'one_pending_invite_per_email',
        unique: true,
        partialFilterExpression: { status: 'pending' },
      },
      // The pending invites list.
      { key: { weddingId: 1, status: 1 } },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'weddingId',
          'email',
          'role',
          'sideScope',
          'tokenHash',
          'status',
          'expiresAt',
          'invitedByUserId',
          'schemaVersion',
          'createdAt',
        ],
        properties: {
          weddingId: { bsonType: 'objectId' },
          email: { bsonType: 'string' },
          role: { enum: ['admin', 'manager'] },
          sideScope: { enum: ['bride', 'groom', 'both'] },
          tokenHash: { bsonType: 'string', minLength: 64, maxLength: 64 },
          status: { enum: ['pending', 'accepted', 'cancelled', 'expired'] },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
