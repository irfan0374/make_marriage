import 'server-only';
import type { ClientSession, ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { createElement } from 'react';
import { SESSION_COOKIE_NAME } from '@/config/app';
import { MemberInviteEmail } from '@/emails/member-invite';
import { withTransaction } from '@/lib/db/transaction';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { trustWeddingId, type WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { enforceRateLimits, HOUR } from '@/lib/rate-limit';
import { randomToken, sha256Hex } from '@/lib/tokens';
import { findUserIdByEmail, getSession, getUsersByIds, requireSession } from '@/modules/auth';
import {
  addMember,
  countWeddingAdmins,
  getMember,
  isMember,
  listMembers,
  removeMembership,
  requireAdmin,
  resolveWeddingContext,
  setMemberRole,
  type Role,
  type SideScope,
  type WeddingContext,
} from '@/modules/members';
import { sendEmail } from '@/modules/notifications';
import { getWeddingBasics, requireWritableWedding } from '@/modules/weddings';
import { formatDate, todayIn } from '@/shared/dates';
import {
  closeInvite,
  countLiveAdminInvites,
  DuplicatePendingInviteError,
  findInviteByTokenHash,
  findPendingInvite,
  findPendingInviteByEmail,
  insertInvite,
  listPendingInvites,
  markInviteAccepted,
  replaceInviteToken,
} from './team.repository';
import { inviteTokenSchema } from './team.schemas';
import type {
  ChangeMemberInput,
  CreateInviteInput,
  InviteLink,
  InvitePreview,
  InviteProblem,
  JoinPageState,
  MemberInviteDocument,
  PendingInvite,
  Team,
  TeamMember,
} from './team.types';

// Team and member invitations (architecture §6.4, api-spec §7, PRD AUTH-3 to AUTH-9).

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ADMINS = 2;
/** Invites (and new links) per wedding per hour: each one can send an email. */
const INVITES_PER_HOUR = 20;

function isExpired(invite: MemberInviteDocument, now: Date): boolean {
  return invite.expiresAt.getTime() <= now.getTime();
}

function toPendingInvite(invite: MemberInviteDocument, now: Date): PendingInvite {
  return {
    id: invite._id.toHexString(),
    email: invite.email,
    role: invite.role,
    sideScope: invite.sideScope,
    expiresAt: invite.expiresAt.toISOString(),
    expired: isExpired(invite, now),
  };
}

function joinUrl(token: string): string {
  return new URL(`/join/${token}`, getEnv().APP_URL).toString();
}

const SIDE_LABELS: Record<SideScope, string> = {
  bride: 'Bride side',
  groom: 'Groom side',
  both: 'Both sides',
};

/** The side a member is limited to, or `null` when it doesn't apply (admins, sides off). */
function effectiveSide(role: Role, sideScope: SideScope, sidesEnabled: boolean): SideScope | null {
  return role === 'admin' || !sidesEnabled ? null : sideScope;
}

/** Writes need an admin, in a wedding that isn't archived. */
async function requireTeamAdmin(token: string | undefined, weddingId: ObjectId) {
  const context = await resolveWeddingContext(token, weddingId);
  requireAdmin(context);
  const wedding = await requireWritableWedding(context.weddingId);
  return { context, wedding };
}

/**
 * The 2-admin limit counts admins plus admin invites that can still be accepted, so a new admin
 * invite, a renewed one and a promotion all follow the same rule. `exceptInviteId`: the invite
 * being renewed, which doesn't count against itself.
 */
async function requireAdminRoom(
  weddingId: WeddingId,
  now: Date,
  options: { exceptInviteId?: ObjectId; session?: ClientSession } = {},
): Promise<void> {
  // One after the other: a transaction session can't run two operations at once.
  const admins = await countWeddingAdmins(weddingId, options.session);
  const adminInvites = await countLiveAdminInvites(
    weddingId,
    now,
    options.exceptInviteId,
    options.session,
  );
  if (admins + adminInvites >= MAX_ADMINS) throw new AppError('ADMIN_LIMIT_REACHED');
}

/** Email the invite link. Returns whether it was sent; a failure never fails the invite. */
async function emailInvite(
  context: WeddingContext,
  wedding: { brideName: string; groomName: string; sidesEnabled: boolean; timezone: string },
  invite: MemberInviteDocument,
  token: string,
): Promise<boolean> {
  const coupleNames = `${wedding.brideName} & ${wedding.groomName}`;
  const side = effectiveSide(invite.role, invite.sideScope, wedding.sidesEnabled);
  const result = await sendEmail({
    template: 'member_invite',
    to: invite.email,
    subject: `${coupleNames} invited you to help plan their wedding`,
    fromName: context.user.name,
    replyTo: context.user.email,
    weddingId: context.weddingId,
    body: createElement(MemberInviteEmail, {
      inviterName: context.user.name,
      coupleNames,
      roleLabel: invite.role === 'admin' ? 'Admin' : 'Manager',
      sideLabel: side && side !== 'both' ? SIDE_LABELS[side] : undefined,
      joinUrl: joinUrl(token),
      expiresOn: formatDate(todayIn(wedding.timezone, invite.expiresAt)),
    }),
    // A retried request with the same link never sends twice.
    idempotencyKey: `member_invite:${sha256Hex(token)}`,
  });
  return result === 'sent';
}

/** GET members (api-spec §7.1): everyone on the team; pending invites for admins only. */
export async function getTeam(
  token: string | undefined,
  weddingId: ObjectId,
  now = new Date(),
): Promise<Team> {
  const context = await resolveWeddingContext(token, weddingId);
  const memberships = await listMembers(context.weddingId);
  const users = await getUsersByIds(memberships.map((m) => m.userId));
  const members: TeamMember[] = memberships.flatMap((m) => {
    const user = users.get(m.userId.toHexString());
    if (!user) return [];
    return [
      {
        id: m._id.toHexString(),
        user,
        role: m.role,
        sideScope: m.role === 'admin' ? 'both' : m.sideScope,
        joinedAt: m.joinedAt.toISOString(),
      },
    ];
  });
  const pendingInvites =
    context.role === 'admin'
      ? (await listPendingInvites(context.weddingId)).map((i) => toPendingInvite(i, now))
      : null;
  return { members, pendingInvites };
}

/**
 * POST invites (api-spec §7.2): create a pending invite, email the link, and return the link
 * once (only its hash is stored). An email that fails still leaves a usable invite.
 */
export async function createInvite(
  token: string | undefined,
  weddingId: ObjectId,
  input: CreateInviteInput,
  now = new Date(),
): Promise<InviteLink> {
  const { context, wedding } = await requireTeamAdmin(token, weddingId);
  await enforceRateLimits(
    [
      {
        key: `invites:wedding:${context.weddingId.toHexString()}`,
        limit: INVITES_PER_HOUR,
        windowMs: HOUR,
      },
    ],
    now,
  );

  // Only this wedding's team is checked: whether the person has a wedding elsewhere is private.
  const existingUserId = await findUserIdByEmail(input.email);
  if (existingUserId && (await isMember(context.weddingId, existingUserId))) {
    throw new AppError('ALREADY_MEMBER');
  }

  const pending = await findPendingInviteByEmail(context.weddingId, input.email);
  if (pending && !isExpired(pending, now)) throw new AppError('INVITE_PENDING');
  // An expired invite for the same email is replaced by this one.
  if (pending) await closeInvite(context.weddingId, pending._id, 'expired', now);

  if (input.role === 'admin') await requireAdminRoom(context.weddingId, now);

  const rawToken = randomToken();
  let invite: MemberInviteDocument;
  try {
    invite = await insertInvite(context.weddingId, {
      email: input.email,
      role: input.role,
      sideScope: input.role === 'admin' ? 'both' : input.sideScope,
      tokenHash: sha256Hex(rawToken),
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      invitedByUserId: context.userId,
      now,
    });
  } catch (error) {
    if (error instanceof DuplicatePendingInviteError) throw new AppError('INVITE_PENDING');
    throw error;
  }

  const emailSent = await emailInvite(context, wedding, invite, rawToken);
  logger.info('team.invite_created', {
    weddingId: context.weddingId.toHexString(),
    inviteId: invite._id.toHexString(),
    role: invite.role,
    emailSent,
  });
  return { invite: toPendingInvite(invite, now), inviteLink: joinUrl(rawToken), emailSent };
}

/**
 * "Get new link" (api-spec §7.3): a new link with a fresh 7 days, emailed again. The old link
 * stops working at once. Works for expired invites too; an expired admin invite stopped counting
 * toward the 2-admin limit, so it's checked again before it comes back to life.
 */
export async function renewInvite(
  token: string | undefined,
  weddingId: ObjectId,
  inviteId: ObjectId,
  now = new Date(),
): Promise<InviteLink> {
  const { context, wedding } = await requireTeamAdmin(token, weddingId);
  await enforceRateLimits(
    [
      {
        key: `invites:wedding:${context.weddingId.toHexString()}`,
        limit: INVITES_PER_HOUR,
        windowMs: HOUR,
      },
    ],
    now,
  );
  const existing = await findPendingInvite(context.weddingId, inviteId);
  if (!existing) throw new AppError('NOT_FOUND');
  if (existing.role === 'admin') {
    await requireAdminRoom(context.weddingId, now, { exceptInviteId: existing._id });
  }
  const rawToken = randomToken();
  const invite = await replaceInviteToken(
    context.weddingId,
    inviteId,
    sha256Hex(rawToken),
    new Date(now.getTime() + INVITE_TTL_MS),
    now,
  );
  if (!invite) throw new AppError('NOT_FOUND');
  const emailSent = await emailInvite(context, wedding, invite, rawToken);
  logger.info('team.invite_renewed', {
    weddingId: context.weddingId.toHexString(),
    inviteId: invite._id.toHexString(),
    emailSent,
  });
  return { invite: toPendingInvite(invite, now), inviteLink: joinUrl(rawToken), emailSent };
}

/** DELETE invite (api-spec §7.4): cancel a pending invite; its link stops working. */
export async function cancelInvite(
  token: string | undefined,
  weddingId: ObjectId,
  inviteId: ObjectId,
  now = new Date(),
): Promise<void> {
  const { context } = await requireTeamAdmin(token, weddingId);
  if (!(await closeInvite(context.weddingId, inviteId, 'cancelled', now))) {
    throw new AppError('NOT_FOUND');
  }
  logger.info('team.invite_cancelled', {
    weddingId: context.weddingId.toHexString(),
    inviteId: inviteId.toHexString(),
  });
}

/**
 * PATCH member (api-spec §7.5): change role and/or side. At most 2 admins, never fewer than 1;
 * someone who is an admin of another wedding can't become one here; admins see both sides.
 */
export async function changeMember(
  token: string | undefined,
  weddingId: ObjectId,
  memberId: ObjectId,
  input: ChangeMemberInput,
  now = new Date(),
): Promise<TeamMember> {
  const { context } = await requireTeamAdmin(token, weddingId);
  const updated = await withTransaction(async (session) => {
    const member = await getMember(context.weddingId, memberId);
    if (!member) throw new AppError('NOT_FOUND');
    const role = input.role ?? member.role;
    const sideScope = input.sideScope ?? member.sideScope;
    // A promotion uses the same rule as an admin invite: pending admin invites hold a place.
    if (role === 'admin' && member.role !== 'admin') {
      await requireAdminRoom(context.weddingId, now, { session });
    }
    if (
      role !== 'admin' &&
      member.role === 'admin' &&
      (await countWeddingAdmins(context.weddingId, session)) <= 1
    ) {
      throw new AppError('LAST_ADMIN');
    }
    const saved = await setMemberRole(context.weddingId, memberId, role, sideScope, now, session);
    if (!saved) throw new AppError('NOT_FOUND');
    return saved;
  });
  const users = await getUsersByIds([updated.userId]);
  const user = users.get(updated.userId.toHexString());
  if (!user) throw new AppError('NOT_FOUND');
  logger.info('team.member_changed', {
    weddingId: context.weddingId.toHexString(),
    memberId: memberId.toHexString(),
    role: updated.role,
  });
  return {
    id: updated._id.toHexString(),
    user,
    role: updated.role,
    sideScope: updated.role === 'admin' ? 'both' : updated.sideScope,
    joinedAt: updated.joinedAt.toISOString(),
  };
}

/**
 * DELETE member (api-spec §7.6): an admin takes someone off the team. They lose access on their
 * next request. A wedding always keeps at least one admin.
 */
export async function removeMember(
  token: string | undefined,
  weddingId: ObjectId,
  memberId: ObjectId,
): Promise<void> {
  const { context } = await requireTeamAdmin(token, weddingId);
  await withTransaction(async (session) => {
    const member = await getMember(context.weddingId, memberId);
    if (!member) throw new AppError('NOT_FOUND');
    if (member.role === 'admin' && (await countWeddingAdmins(context.weddingId, session)) <= 1) {
      throw new AppError('LAST_ADMIN');
    }
    if (!(await removeMembership(context.weddingId, memberId, session))) {
      throw new AppError('NOT_FOUND');
    }
  });
  logger.info('team.member_removed', {
    weddingId: context.weddingId.toHexString(),
    memberId: memberId.toHexString(),
  });
}

/** Why an invite can't be used, or `null` if it can. */
function inviteProblem(invite: MemberInviteDocument | null, now: Date): InviteProblem | null {
  if (!invite) return 'unknown';
  if (invite.status === 'accepted') return 'used';
  if (invite.status === 'cancelled') return 'cancelled';
  if (invite.status === 'expired' || isExpired(invite, now)) return 'expired';
  return null;
}

function invalidInvite(problem: InviteProblem): AppError {
  // Only the person holding the link learns why; a made-up link reveals nothing.
  return new AppError(
    'INVITE_INVALID',
    undefined,
    problem === 'unknown' ? {} : { details: { reason: problem } },
  );
}

async function loadInvite(rawToken: string, now: Date) {
  const invite = await findInviteByTokenHash(sha256Hex(rawToken));
  const problem = inviteProblem(invite, now);
  if (problem || !invite) throw invalidInvite(problem ?? 'unknown');
  // A valid link names its wedding, like a guest link (architecture §7.5).
  const weddingId = trustWeddingId(invite.weddingId);
  const wedding = await getWeddingBasics(weddingId);
  if (!wedding) throw invalidInvite('unknown');
  return { invite, weddingId, wedding };
}

async function toPreview(
  invite: MemberInviteDocument,
  wedding: { brideName: string; groomName: string; sidesEnabled: boolean },
): Promise<InvitePreview> {
  const weddingName = `${wedding.brideName} & ${wedding.groomName}`;
  const inviter = (await getUsersByIds([invite.invitedByUserId])).get(
    invite.invitedByUserId.toHexString(),
  );
  return {
    weddingName,
    invitedEmail: invite.email,
    invitedByName: inviter?.name ?? weddingName,
    role: invite.role,
    sideScope: effectiveSide(invite.role, invite.sideScope, wedding.sidesEnabled),
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/** GET /api/member-invites/{token} (api-spec §7.8): what the join page shows. */
export async function previewInvite(rawToken: string, now = new Date()): Promise<InvitePreview> {
  const { invite, wedding } = await loadInvite(rawToken, now);
  return toPreview(invite, wedding);
}

/**
 * POST /api/member-invites/{token}/accept (api-spec §7.9): the logged-in user joins. Their email
 * must match the invite; they mustn't be on the team already; joining as admin respects the
 * 2-admin limit and the one-admin-wedding rule. Membership and "used" are saved together.
 */
export async function acceptInvite(
  sessionToken: string | undefined,
  rawToken: string,
  now = new Date(),
): Promise<{ weddingId: string }> {
  const session = await requireSession(sessionToken, now);
  const { invite, weddingId, wedding } = await loadInvite(rawToken, now);

  if (session.user.email !== invite.email) {
    throw new AppError('INVITE_EMAIL_MISMATCH', undefined, {
      details: { invitedEmail: invite.email },
    });
  }
  if (await isMember(weddingId, session.userId)) {
    throw new AppError('ALREADY_MEMBER', undefined, {
      details: { weddingId: weddingId.toHexString() },
    });
  }
  if (wedding.status === 'archived') throw new AppError('WEDDING_ARCHIVED');

  await withTransaction(async (txn) => {
    if (invite.role === 'admin' && (await countWeddingAdmins(weddingId, txn)) >= MAX_ADMINS) {
      throw new AppError('ADMIN_LIMIT_REACHED');
    }
    await addMember(
      weddingId,
      {
        userId: session.userId,
        role: invite.role,
        sideScope: invite.sideScope,
        invitedByUserId: invite.invitedByUserId,
      },
      now,
      txn,
    );
    const marked = await markInviteAccepted(
      weddingId,
      invite._id,
      invite.tokenHash,
      session.userId,
      now,
      txn,
    );
    if (!marked) throw invalidInvite('used');
  });
  logger.info('team.invite_accepted', {
    weddingId: weddingId.toHexString(),
    inviteId: invite._id.toHexString(),
  });
  return { weddingId: weddingId.toHexString() };
}

/** For `/join/{token}`: the invite and where the visitor stands with it (session cookie). */
export async function getJoinPageState(rawToken: string, now = new Date()): Promise<JoinPageState> {
  if (!inviteTokenSchema.safeParse(rawToken).success)
    return { state: 'problem', problem: 'unknown' };
  let loaded: Awaited<ReturnType<typeof loadInvite>>;
  try {
    loaded = await loadInvite(rawToken, now);
  } catch (error) {
    if (error instanceof AppError && error.code === 'INVITE_INVALID') {
      const reason = (error.details as { reason?: InviteProblem } | undefined)?.reason;
      return { state: 'problem', problem: reason ?? 'unknown' };
    }
    throw error;
  }
  const invite = await toPreview(loaded.invite, loaded.wedding);
  const session = await getSession(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value || undefined,
    now,
  );
  if (!session) return { state: 'logged_out', invite };
  if (session.user.email !== invite.invitedEmail) {
    return { state: 'mismatch', invite, currentEmail: session.user.email };
  }
  if (await isMember(loaded.weddingId, session.userId)) {
    return { state: 'member', invite, weddingId: loaded.weddingId.toHexString() };
  }
  return { state: 'ready', invite, currentEmail: session.user.email };
}
