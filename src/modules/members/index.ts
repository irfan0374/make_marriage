import 'server-only';

// Public API of the members module.
export {
  addFirstAdmin,
  listUserMemberships,
  requireAdmin,
  resolveWeddingContext,
} from './members.service';
export type { WeddingContext } from './members.service';
export { membersCollectionSpecs } from './members.indexes';
export type { Role, SideScope } from './members.types';
