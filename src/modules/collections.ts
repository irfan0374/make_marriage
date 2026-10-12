import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';
import { rateLimitsSpec } from '@/lib/db/rate-limits.repository';
import { authCollectionSpecs } from '@/modules/auth';
import { eventsCollectionSpecs } from '@/modules/events';
import { householdsCollectionSpecs } from '@/modules/households';
import { membersCollectionSpecs } from '@/modules/members';
import { notificationsCollectionSpecs } from '@/modules/notifications';
import { tasksCollectionSpecs } from '@/modules/tasks';
import { teamCollectionSpecs } from '@/modules/team';
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
  ...teamCollectionSpecs,
  ...eventsCollectionSpecs,
  ...householdsCollectionSpecs,
  ...tasksCollectionSpecs,
  ...notificationsCollectionSpecs,
];
