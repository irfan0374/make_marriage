import 'server-only';
import { ObjectId, type ClientSession } from 'mongodb';
import { globalCollection } from '@/lib/db/client';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import { MEMBERSHIPS } from './members.indexes';
import type { MembershipDocument, Role, SideScope } from './members.types';

const scoped = (weddingId: WeddingId) =>
  scopedCollection<MembershipDocument>(MEMBERSHIPS, weddingId);

export async function insertMembership(
  weddingId: WeddingId,
  input: {
    userId: ObjectId;
    role: Role;
    sideScope: SideScope;
    invitedByUserId: ObjectId | null;
    now: Date;
  },
  session?: ClientSession,
): Promise<void> {
  await scoped(weddingId).insertOne(
    {
      _id: new ObjectId(),
      userId: input.userId,
      role: input.role,
      sideScope: input.sideScope,
      invitedByUserId: input.invitedByUserId,
      joinedAt: input.now,
      schemaVersion: 1,
      createdAt: input.now,
      updatedAt: input.now,
    },
    { session },
  );
}

/**
 * The membership check itself, so it takes a wedding id that isn't verified yet. Its result is
 * what verifies the id (see `trustWeddingId`). Matches on both ids, so it can only ever return
 * this user's own membership.
 */
export function findMembership(userId: ObjectId, weddingId: ObjectId) {
  return globalCollection<MembershipDocument>(MEMBERSHIPS).findOne({ weddingId, userId });
}

/** Every wedding a user belongs to (across tenants, by design: it's the user's own list). */
export function findUserMemberships(userId: ObjectId) {
  return globalCollection<MembershipDocument>(MEMBERSHIPS)
    .find({ userId }, { projection: { weddingId: 1, role: 1, sideScope: 1 } })
    .toArray();
}
