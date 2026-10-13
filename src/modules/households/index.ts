import 'server-only';

// Public API of the households module: guest families (api-spec §9).
export {
  importHouseholdsHandler,
  exportHouseholdsHandler,
  importTemplateHandler,
  bulkHouseholdsHandler,
  clearRsvpHandler,
  markSentHandler,
  recordRsvpHandler,
  regenerateLinkHandler,
  rsvpExportHandler,
  rsvpSummaryHandler,
  createHouseholdHandler,
  deleteHouseholdHandler,
  getHouseholdHandler,
  householdDuplicatesHandler,
  householdSummaryHandler,
  listHouseholdsHandler,
  updateHouseholdHandler,
} from './households.handlers';
export { householdsCollectionSpecs } from './households.indexes';
export {
  countAllFamiliesInvitedTo,
  countFamiliesInvitedTo,
  chooseFamiliesToEmail,
  findInvitationHousehold,
  getFamilyForEmail,
  invitationScope,
  recordInvitationEmailed,
  recordInvitationEmailFailed,
  recordReminded,
  restoreQueuedFamilies,
  withInvitationScope,
  type FamiliesToEmail,
  inviteLinkOf,
  markInvitationOpened,
  removeEventFromHouseholds,
  saveGuestRsvps,
  stopInvitationReminders,
} from './households.service';
export type {
  Household,
  HouseholdDocument,
  HouseholdSummary,
  RsvpReply,
  RsvpSummary,
} from './households.types';
