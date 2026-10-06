import 'server-only';

// Public API of the members module.
export {
  addFirstAdmin,
  addMember,
  countWeddingAdmins,
  getAdminWeddingId,
  getMember,
  isMember,
  listMembers,
  listUserMemberships,
  removeMembership,
  setMemberRole,
  requireAdmin,
  resolveWeddingContext,
} from './members.service';
export type { WeddingContext } from './members.service';
export { membersCollectionSpecs } from './members.indexes';
export type { MembershipDocument, Role, SideScope } from './members.types';
