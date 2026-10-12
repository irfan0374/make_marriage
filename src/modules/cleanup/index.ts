import 'server-only';

// Public API of the cleanup module: deletes that tidy linked data across modules
// (database-design §8, architecture §4.1).
export { deleteEventHandler } from './cleanup.handlers';
