import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const HOUSEHOLDS = 'households';

/** Case-insensitive English ordering for family names. */
export const NAME_COLLATION = { locale: 'en', strength: 2 } as const;

// database-design §7.5.
export const householdsCollectionSpecs: CollectionSpec[] = [
  {
    collection: HOUSEHOLDS,
    indexes: [
      // The guest invitation page and RSVP.
      { key: { token: 1 }, unique: true },
      // Guest list sorted by name, with the side filter.
      { key: { weddingId: 1, side: 1, displayName: 1 }, collation: NAME_COLLATION },
      // "Not sent" list and bulk send.
      { key: { weddingId: 1, inviteStatus: 1 } },
      // Non-responders for reminders.
      { key: { weddingId: 1, responseStatus: 1 } },
      // Families invited to an event, RSVP summary, event delete cleanup.
      { key: { weddingId: 1, 'invitedEvents.eventId': 1 } },
      // Tag filter.
      { key: { weddingId: 1, tags: 1 } },
      // Duplicate warning, bounce matching.
      { key: { weddingId: 1, email: 1 } },
      { key: { weddingId: 1, phone: 1 } },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'weddingId',
          'displayName',
          'members',
          'headcount',
          'tags',
          'searchText',
          'token',
          'invitedEvents',
          'rsvps',
          'archivedRsvps',
          'inviteStatus',
          'responseStatus',
          'createdByUserId',
          'schemaVersion',
          'createdAt',
        ],
        properties: {
          weddingId: { bsonType: 'objectId' },
          displayName: { bsonType: 'string', minLength: 1, maxLength: 100 },
          members: { bsonType: 'array', maxItems: 30 },
          headcount: { bsonType: 'int', minimum: 1, maximum: 50 },
          email: { bsonType: ['string', 'null'] },
          phone: { bsonType: ['string', 'null'] },
          side: { enum: ['bride', 'groom', null] },
          tags: { bsonType: 'array', maxItems: 20 },
          notes: { bsonType: 'string', maxLength: 1000 },
          token: { bsonType: 'string', minLength: 22, maxLength: 22 },
          invitedEvents: { bsonType: 'array', maxItems: 50 },
          inviteStatus: { enum: ['not_sent', 'queued', 'sent', 'sent_manually', 'failed'] },
          responseStatus: { enum: ['none', 'partial', 'complete'] },
          createdByUserId: { bsonType: 'objectId' },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
