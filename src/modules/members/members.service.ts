import 'server-only';
import type { ClientSession, ObjectId } from 'mongodb';
import { AppError } from '@/lib/errors';
import { trustWeddingId, type WeddingId } from '@/lib/ids';
import { requireSession, type PublicUser } from '@/modules/auth';
import { findMembership, findUserMemberships, insertMembership } from './members.repository';
import type { Role, SideScope } from './members.types';

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

/** The creator of a new wedding becomes its first admin (in the create-wedding transaction). */
export function addFirstAdmin(
  weddingId: WeddingId,
  userId: ObjectId,
  now: Date,
  session: ClientSession,
): Promise<void> {
  return insertMembership(
    weddingId,
    { userId, role: 'admin', sideScope: 'both', invitedByUserId: null, now },
    session,
  );
}

export async function listUserMemberships(userId: ObjectId) {
  const memberships = await findUserMemberships(userId);
  return memberships.map((m) => ({
    weddingId: m.weddingId,
    role: m.role,
    sideScope: m.sideScope,
  }));
}
