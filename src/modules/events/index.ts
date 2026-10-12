import 'server-only';

// Public API of the events module (api-spec §8).
export {
  addPresetEventsHandler,
  createEventHandler,
  listEventsHandler,
  reorderEventsHandler,
  updateEventHandler,
} from './events.handlers';
export { eventsCollectionSpecs } from './events.indexes';
export { deleteEventRecord, getEvent } from './events.service';
export type { EventChangeMeta, WeddingEvent } from './events.types';
