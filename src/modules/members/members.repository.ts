import 'server-only';
import { MongoServerError, ObjectId, type ClientSession } from 'mongodb';
import { globalCollection } from '@/lib/db/client';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import { MEMBERSHIPS } from './members.indexes';
import type { MembershipDocument, Role, SideScope } from './members.types';

const scoped = (weddingId: WeddingId) =>
  scopedCollection<MembershipDocument>(MEMBERSHIPS, weddingId);

/** The user is already an admin of another wedding (the one-admin-wedding index). */
export class AlreadyAdminError extends Error {}

/** The user already has a membership in this wedding (the weddingId + userId index). */
export class AlreadyMemberError extends Error {}

function rethrowDuplicate(error: unknown): never {
  if (error instanceof MongoServerError && error.code === 11000) {
    if (/one_admin_wedding_per_user/.test(error.message)) throw new AlreadyAdminError();
    if (/weddingId_1_userId_1/.test(error.message)) throw new AlreadyMemberError();
  }
  throw error;
}

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
  try {
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
  } catch (error) {
    rethrowDuplicate(error);
  }
}

/** The wedding's team, earliest joined first. */
export function listMemberships(weddingId: WeddingId) {
  return scoped(weddingId)
    .find({}, { sort: { joinedAt: 1, _id: 1 } })
    .toArray();
}

export function findMembershipById(weddingId: WeddingId, memberId: ObjectId) {
  return scoped(weddingId).findOne({ _id: memberId });
}

export function countAdmins(weddingId: WeddingId, session?: ClientSession) {
  return scoped(weddingId).countDocuments({ role: 'admin' }, { session });
}

export async function updateMembership(
  weddingId: WeddingId,
  memberId: ObjectId,
  changes: { role: Role; sideScope: SideScope },
  now: Date,
  session?: ClientSession,
) {
  try {
    return await scoped(weddingId).findOneAndUpdate(
      { _id: memberId },
      { $set: { ...changes, updatedAt: now } },
      { returnDocument: 'after', session },
    );
  } catch (error) {
    rethrowDuplicate(error);
  }
}

/** The wedding this user is an admin of, if any (at most one). */
export async function findAdminWeddingId(userId: ObjectId): Promise<ObjectId | null> {
  const membership = await globalCollection<MembershipDocument>(MEMBERSHIPS).findOne(
    { userId, role: 'admin' },
    { projection: { weddingId: 1 } },
  );
  return membership?.weddingId ?? null;
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

/** Delete one membership of this wedding; `false` if it wasn't there. */
export async function deleteMembership(
  weddingId: WeddingId,
  memberId: ObjectId,
  session?: ClientSession,
): Promise<boolean> {
  const result = await scoped(weddingId).deleteOne({ _id: memberId }, { session });
  return result.deletedCount === 1;
}
