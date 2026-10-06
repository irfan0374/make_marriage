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
} from './weddings.service';
export type { Me, Wedding, WeddingSummary } from './weddings.types';
