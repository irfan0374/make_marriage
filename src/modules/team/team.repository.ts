import 'server-only';
import { MongoServerError, ObjectId, type ClientSession } from 'mongodb';
import { globalCollection } from '@/lib/db/client';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import type { Role, SideScope } from '@/modules/members';
import { MEMBER_INVITES } from './team.indexes';
import type { MemberInviteDocument } from './team.types';

const scoped = (weddingId: WeddingId) =>
  scopedCollection<MemberInviteDocument>(MEMBER_INVITES, weddingId);

/** Another pending invite for this email appeared at the same moment. */
export class DuplicatePendingInviteError extends Error {}

export async function insertInvite(
  weddingId: WeddingId,
  input: {
    email: string;
    role: Role;
    sideScope: SideScope;
    tokenHash: string;
    expiresAt: Date;
    invitedByUserId: ObjectId;
    now: Date;
  },
): Promise<MemberInviteDocument> {
  const doc = {
    _id: new ObjectId(),
    email: input.email,
    role: input.role,
    sideScope: input.sideScope,
    tokenHash: input.tokenHash,
    status: 'pending' as const,
    expiresAt: input.expiresAt,
    invitedByUserId: input.invitedByUserId,
    acceptedByUserId: null,
    acceptedAt: null,
    schemaVersion: 1 as const,
    createdAt: input.now,
    updatedAt: input.now,
  };
  try {
    await scoped(weddingId).insertOne(doc);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new DuplicatePendingInviteError();
    }
    throw error;
  }
  return { ...doc, weddingId };
}

/** Pending invites, newest first. Includes ones past their expiry (shown as "Expired"). */
export function listPendingInvites(weddingId: WeddingId) {
  return scoped(weddingId)
    .find({ status: 'pending' }, { sort: { createdAt: -1 } })
    .toArray();
}

export function findPendingInviteByEmail(weddingId: WeddingId, email: string) {
  return scoped(weddingId).findOne({ status: 'pending', email });
}

/**
 * Pending admin invites that can still be accepted, which count toward the 2-admin limit.
 * `exceptInviteId` leaves one out (the invite getting a new link).
 */
export function countLiveAdminInvites(
  weddingId: WeddingId,
  now: Date,
  exceptInviteId?: ObjectId,
  session?: ClientSession,
) {
  return scoped(weddingId).countDocuments(
    {
      status: 'pending',
      role: 'admin',
      expiresAt: { $gt: now },
      ...(exceptInviteId ? { _id: { $ne: exceptInviteId } } : {}),
    },
    { session },
  );
}

export function findPendingInvite(weddingId: WeddingId, inviteId: ObjectId) {
  return scoped(weddingId).findOne({ _id: inviteId, status: 'pending' });
}

/** Close a pending invite: `expired` (replaced by a new one) or `cancelled` by an admin. */
export async function closeInvite(
  weddingId: WeddingId,
  inviteId: ObjectId,
  status: 'expired' | 'cancelled',
  now: Date,
): Promise<boolean> {
  const result = await scoped(weddingId).updateOne(
    { _id: inviteId, status: 'pending' },
    { $set: { status, updatedAt: now } },
  );
  return result.modifiedCount === 1;
}

/** A new link and a fresh expiry; the old link's hash is gone, so it stops working at once. */
export function replaceInviteToken(
  weddingId: WeddingId,
  inviteId: ObjectId,
  tokenHash: string,
  expiresAt: Date,
  now: Date,
) {
  return scoped(weddingId).findOneAndUpdate(
    { _id: inviteId, status: 'pending' },
    { $set: { tokenHash, expiresAt, updatedAt: now } },
    { returnDocument: 'after' },
  );
}

/**
 * Look an invite up by its link. Like guest links, a token names its own wedding, so this is
 * the one global lookup; its result is what identifies the wedding.
 */
export function findInviteByTokenHash(tokenHash: string) {
  return globalCollection<MemberInviteDocument>(MEMBER_INVITES).findOne({ tokenHash });
}

/** Mark the invite used, once: `false` if it was used, cancelled or replaced meanwhile. */
export async function markInviteAccepted(
  weddingId: WeddingId,
  inviteId: ObjectId,
  tokenHash: string,
  userId: ObjectId,
  now: Date,
  session: ClientSession,
): Promise<boolean> {
  const result = await scoped(weddingId).updateOne(
    { _id: inviteId, tokenHash, status: 'pending' },
    { $set: { status: 'accepted', acceptedByUserId: userId, acceptedAt: now, updatedAt: now } },
    { session },
  );
  return result.modifiedCount === 1;
}
