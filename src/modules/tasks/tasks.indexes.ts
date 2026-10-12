import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const TASKS = 'tasks';

// database-design §7.6.
export const tasksCollectionSpecs: CollectionSpec[] = [
  {
    collection: TASKS,
    indexes: [
      {
        key: { weddingId: 1, starterKey: 1 },
        unique: true,
        partialFilterExpression: { starterKey: { $type: 'string' } },
      },
      // The task list; due soon and overdue on the dashboard.
      { key: { weddingId: 1, status: 1, dueDate: 1 } },
      // "My tasks", and unassigning someone who leaves the team.
      { key: { weddingId: 1, assigneeUserId: 1, status: 1 } },
      // Tasks for an event, and clearing them when the event is deleted.
      { key: { weddingId: 1, eventId: 1 } },
      // The daily due-date reminder job, across weddings.
      {
        key: { status: 1, dueDate: 1 },
        partialFilterExpression: { assigneeUserId: { $type: 'objectId' } },
      },
    ],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'weddingId',
          'title',
          'status',
          'createdByUserId',
          'source',
          'schemaVersion',
          'createdAt',
        ],
        properties: {
          weddingId: { bsonType: 'objectId' },
          title: { bsonType: 'string', minLength: 1, maxLength: 120 },
          description: { bsonType: 'string', maxLength: 2000 },
          dueDate: { bsonType: ['string', 'null'] },
          assigneeUserId: { bsonType: ['objectId', 'null'] },
          status: { enum: ['todo', 'in_progress', 'done'] },
          priority: { enum: ['high', 'medium', 'low'] },
          eventId: { bsonType: ['objectId', 'null'] },
          completedAt: { bsonType: ['date', 'null'] },
          createdByUserId: { bsonType: 'objectId' },
          editedByUserId: { bsonType: 'objectId' },
          editedAt: { bsonType: 'date' },
          source: { enum: ['manual', 'starter'] },
          starterKey: { bsonType: ['string', 'null'] },
          schemaVersion: { bsonType: 'int' },
        },
      },
    },
  },
];
