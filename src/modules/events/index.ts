import 'server-only';

// Public API of the events module (api-spec §8).
export {
  addPresetEventsHandler,
  createEventHandler,
  deleteEventHandler,
  listEventsHandler,
  reorderEventsHandler,
  updateEventHandler,
} from './events.handlers';
export { eventsCollectionSpecs } from './events.indexes';
export type { EventChangeMeta, WeddingEvent } from './events.types';
