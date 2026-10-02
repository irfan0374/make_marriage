import 'server-only';

// Public API of the weddings module.
export { createWeddingHandler, getMeHandler, getWeddingHandler } from './weddings.handlers';
export { weddingsCollectionSpecs } from './weddings.indexes';
export { getPageWedding } from './weddings.service';
export type { Me, Wedding, WeddingSummary } from './weddings.types';
