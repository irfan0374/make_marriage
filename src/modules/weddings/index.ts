import 'server-only';

// Public API of the weddings module.
export {
  createWeddingHandler,
  getMeHandler,
  getWeddingHandler,
  updateWeddingHandler,
} from './weddings.handlers';
export { weddingsCollectionSpecs } from './weddings.indexes';
export {
  getPageCanCreateWedding,
  getPageWedding,
  getWeddingBasics,
  requireWritableWedding,
  lockWeddingTasks,
  ensureGuestTags,
  getWeddingRecord,
  listActiveWeddingTimezones,
  listAutoReminderWeddings,
  saveCustomExpenseCategories,
  saveInvitationSettings,
  DEFAULT_INVITATION_MESSAGE,
} from './weddings.service';
export type { Me, Wedding, WeddingDocument, WeddingSummary } from './weddings.types';
