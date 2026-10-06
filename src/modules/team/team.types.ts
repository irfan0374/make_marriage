import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type { PublicUser } from '@/modules/auth/auth.types';
import type { Role, SideScope } from '@/modules/members/members.types';
import type { changeMemberSchema, createInviteSchema } from './team.schemas';

export type CreateInviteInput = z.output<typeof createInviteSchema>;
export type ChangeMemberInput = z.output<typeof changeMemberSchema>;

/** Stored status. "Expired" is worked out from `expiresAt`, so no background job is needed. */
export type InviteStatus = 'pending' | 'accepted' | 'cancelled' | 'expired';

/** `memberInvites` collection (database-design §7.3). Only the link's hash is stored. */
export interface MemberInviteDocument {
  _id: ObjectId;
  weddingId: ObjectId;
  email: string;
  role: Role;
  sideScope: SideScope;
  tokenHash: string;
  status: InviteStatus;
  expiresAt: Date;
  invitedByUserId: ObjectId;
  acceptedByUserId: ObjectId | null;
  acceptedAt: Date | null;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

/** A team member as the API returns it (api-spec §4.4). */
export interface TeamMember {
  id: string;
  user: PublicUser;
  role: Role;
  sideScope: SideScope;
  joinedAt: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  sideScope: SideScope;
  expiresAt: string;
  /** Past its 7 days; "Get new link" makes it usable again. */
  expired: boolean;
}

/** GET /api/weddings/{weddingId}/members (api-spec §7.1). */
export interface Team {
  members: TeamMember[];
  /** Admins only; `null` for Managers. */
  pendingInvites: PendingInvite[] | null;
}

/** The result of inviting or getting a new link. The link is shown this once. */
export interface InviteLink {
  invite: PendingInvite;
  inviteLink: string;
  emailSent: boolean;
}

/** What the join page shows (api-spec §7.8). */
export interface InvitePreview {
  weddingName: string;
  invitedEmail: string;
  invitedByName: string;
  role: Role;
  /** `null` for admins and when the wedding has sides turned off. */
  sideScope: SideScope | null;
  expiresAt: string;
}

/** Why a link no longer works (api-spec §7.8). `unknown` covers made-up or replaced links. */
export type InviteProblem = 'expired' | 'cancelled' | 'used' | 'unknown';

/** What the join page shows, worked out on the server so it renders the right state at once. */
export type JoinPageState =
  | { state: 'problem'; problem: InviteProblem }
  | { state: 'logged_out'; invite: InvitePreview }
  | { state: 'mismatch'; invite: InvitePreview; currentEmail: string }
  | { state: 'member'; invite: InvitePreview; weddingId: string }
  | { state: 'ready'; invite: InvitePreview; currentEmail: string };
