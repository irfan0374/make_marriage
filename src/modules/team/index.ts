import 'server-only';

// Public API of the team module: invitations and team management (api-spec §7).
export {
  acceptInviteHandler,
  cancelInviteHandler,
  changeMemberHandler,
  createInviteHandler,
  getTeamHandler,
  previewInviteHandler,
  removeMemberHandler,
  renewInviteHandler,
} from './team.handlers';
export { getJoinPageState } from './team.service';
export { teamCollectionSpecs } from './team.indexes';
export type {
  InviteLink,
  InvitePreview,
  InviteProblem,
  JoinPageState,
  PendingInvite,
  Team,
  TeamMember,
} from './team.types';
