import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';

export const USERS = 'users';
export const SESSIONS = 'sessions';

// database-design §6.1–6.2.
export const authCollectionSpecs: CollectionSpec[] = [
  { collection: USERS, indexes: [{ key: { email: 1 }, unique: true }] },
  {
    collection: SESSIONS,
    indexes: [
      { key: { tokenHash: 1 }, unique: true },
      { key: { userId: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  },
];
