import 'server-only';
import type { ClientSession, ObjectId } from 'mongodb';
import { AppError } from '@/lib/errors';
import { trustWeddingId, type WeddingId } from '@/lib/ids';
import { requireSession, type PublicUser } from '@/modules/auth';
import {
  AlreadyAdminError,
  AlreadyMemberError,
  countAdmins,
  deleteMembership,
  findAdminWeddingId,
  findMembership,
  findMembershipById,
  findUserMemberships,
  insertMembership,
  listMemberships,
  updateMembership,
} from './members.repository';
import type { MembershipDocument, Role, SideScope } from './members.types';

// Team members (architecture §7). For now: the creator's admin membership and the membership
// check every wedding request goes through. Invites, roles and removal come with the Team page.

/** Who is asking, in which wedding, and what they may do there (architecture §7.1). */
export interface WeddingContext {
  userId: ObjectId;
  user: PublicUser;
  weddingId: WeddingId;
  role: Role;
  sideScope: SideScope;
}

/**
 * Resolve the session and the caller's membership of `weddingId`. Not logged in → 401.
 * Not a member → 404, never 403, so other weddings can't even be detected (api-spec §3.3).
 */
export async function resolveWeddingContext(
  token: string | undefined,
  weddingId: ObjectId,
): Promise<WeddingContext> {
  const session = await requireSession(token);
  const membership = await findMembership(session.userId, weddingId);
  if (!membership) throw new AppError('NOT_FOUND');
  return {
    userId: session.userId,
    user: session.user,
    // Verified: the membership above proves this user belongs to this wedding.
    weddingId: trustWeddingId(membership.weddingId),
    role: membership.role,
    sideScope: membership.sideScope,
  };
}

/** Admin-only actions: a Manager gets 403 FORBIDDEN (api-spec §3.3). */
export function requireAdmin(context: WeddingContext): void {
  if (context.role !== 'admin') throw new AppError('FORBIDDEN');
}

/**
 * The creator of a new wedding becomes its first admin (in the create-wedding transaction).
 * Someone who is already an admin of a wedding gets 409 ALREADY_HAS_WEDDING: each person is an
 * admin of one wedding only. The database enforces it, so two quick requests can't both pass.
 */
export async function addFirstAdmin(
  weddingId: WeddingId,
  userId: ObjectId,
  now: Date,
  session: ClientSession,
): Promise<void> {
  try {
    await insertMembership(
      weddingId,
      { userId, role: 'admin', sideScope: 'both', invitedByUserId: null, now },
      session,
    );
  } catch (error) {
    if (error instanceof AlreadyAdminError) throw new AppError('ALREADY_HAS_WEDDING');
    throw error;
  }
}

/** The wedding this user is an admin of (their own wedding), or `null`. */
export function getAdminWeddingId(userId: ObjectId): Promise<ObjectId | null> {
  return findAdminWeddingId(userId);
}

export async function listUserMemberships(userId: ObjectId) {
  const memberships = await findUserMemberships(userId);
  return memberships.map((m) => ({
    weddingId: m.weddingId,
    role: m.role,
    sideScope: m.sideScope,
  }));
}

/** Map the database's uniqueness guarantees to the API's error codes. */
function asAppError(error: unknown): never {
  if (error instanceof AlreadyAdminError) throw new AppError('ALREADY_HAS_WEDDING');
  if (error instanceof AlreadyMemberError) throw new AppError('ALREADY_MEMBER');
  throw error;
}

/** Everyone on a wedding's team, earliest joined first. */
export function listMembers(weddingId: WeddingId): Promise<MembershipDocument[]> {
  return listMemberships(weddingId);
}

/** One membership of this wedding, or `null` (also for another wedding's member id). */
export function getMember(weddingId: WeddingId, memberId: ObjectId) {
  return findMembershipById(weddingId, memberId);
}

export async function isMember(weddingId: WeddingId, userId: ObjectId): Promise<boolean> {
  return (await findMembership(userId, weddingId)) !== null;
}

export function countWeddingAdmins(weddingId: WeddingId, session?: ClientSession) {
  return countAdmins(weddingId, session);
}

/**
 * Add someone who accepted an invite. 409 ALREADY_MEMBER if they're on the team already, and
 * 409 ALREADY_HAS_WEDDING for an admin who is already an admin of another wedding.
 */
export async function addMember(
  weddingId: WeddingId,
  input: { userId: ObjectId; role: Role; sideScope: SideScope; invitedByUserId: ObjectId },
  now: Date,
  session: ClientSession,
): Promise<void> {
  try {
    await insertMembership(
      weddingId,
      { ...input, sideScope: input.role === 'admin' ? 'both' : input.sideScope, now },
      session,
    );
  } catch (error) {
    asAppError(error);
  }
}

/** Save a member's role and side. Admins always see both sides. */
export async function setMemberRole(
  weddingId: WeddingId,
  memberId: ObjectId,
  role: Role,
  sideScope: SideScope,
  now: Date,
  session?: ClientSession,
) {
  try {
    return await updateMembership(
      weddingId,
      memberId,
      { role, sideScope: role === 'admin' ? 'both' : sideScope },
      now,
      session,
    );
  } catch (error) {
    asAppError(error);
  }
}

/** Take someone off the team. Their sessions stay (other weddings may still need them). */
export function removeMembership(
  weddingId: WeddingId,
  memberId: ObjectId,
  session?: ClientSession,
): Promise<boolean> {
  return deleteMembership(weddingId, memberId, session);
}
