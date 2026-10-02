import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';
import { rateLimitsSpec } from '@/lib/db/rate-limits.repository';
import { authCollectionSpecs } from '@/modules/auth';
import { membersCollectionSpecs } from '@/modules/members';
import { weddingsCollectionSpecs } from '@/modules/weddings';

/**
 * Every module's collection specs, applied by `pnpm db:indexes`.
 * Each module exports its specs from `index.ts` (defined in `<module>.indexes.ts`); add them here.
 */
export const collectionSpecs: CollectionSpec[] = [
  rateLimitsSpec,
  ...authCollectionSpecs,
  ...weddingsCollectionSpecs,
  ...membersCollectionSpecs,
];
