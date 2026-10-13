import 'server-only';

// Public API of the households module: guest families (api-spec §9).
export {
  importHouseholdsHandler,
  exportHouseholdsHandler,
  importTemplateHandler,
  bulkHouseholdsHandler,
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
  removeEventFromHouseholds,
} from './households.service';
export type { Household, HouseholdSummary } from './households.types';
