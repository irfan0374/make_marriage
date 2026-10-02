import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type { roleSchema, sideScopeSchema } from './members.schemas';

export type Role = z.infer<typeof roleSchema>;
export type SideScope = z.infer<typeof sideScopeSchema>;

/** `memberships` collection (database-design §7.2): one row per user per wedding. */
export interface MembershipDocument {
  _id: ObjectId;
  weddingId: ObjectId;
  userId: ObjectId;
  role: Role;
  /** Ignored while the wedding has sides turned off. Always `both` for admins. */
  sideScope: SideScope;
  /** `null` for the wedding's creator. */
  invitedByUserId: ObjectId | null;
  joinedAt: Date;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}
