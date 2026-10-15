import 'server-only';
import type { CollectionSpec } from '@/lib/db/indexes';
import { rateLimitsSpec } from '@/lib/db/rate-limits.repository';
import { auditCollectionSpecs } from '@/modules/audit';
import { authCollectionSpecs } from '@/modules/auth';
import { eventsCollectionSpecs } from '@/modules/events';
import { expensesCollectionSpecs } from '@/modules/expenses';
import { householdsCollectionSpecs } from '@/modules/households';
import { jobsCollectionSpecs } from '@/modules/jobs';
import { membersCollectionSpecs } from '@/modules/members';
import { notificationsCollectionSpecs } from '@/modules/notifications';
import { tasksCollectionSpecs } from '@/modules/tasks';
import { teamCollectionSpecs } from '@/modules/team';
import { vendorsCollectionSpecs } from '@/modules/vendors';
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
  ...jobsCollectionSpecs,
  ...auditCollectionSpecs,
  ...vendorsCollectionSpecs,
  ...expensesCollectionSpecs,
];
