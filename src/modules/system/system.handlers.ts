import 'server-only';
import { AppError } from '@/lib/errors';
import { defineHandler, ok } from '@/lib/http';
import { getHealth, runJobQueue } from './system.service';

// GET /api/health (api-spec §21.4). Public; 503 when the database is unreachable.
export const getHealthHandler = defineHandler({ route: '/api/health' }, async () => {
  const health = await getHealth();
  return ok(health, undefined, health.db === 'ok' ? 200 : 503);
});

// Any /api path with no route file. Next.js prefers more specific routes, so this only catches
// unknown paths, and returns the JSON envelope instead of the HTML 404 page.
export const apiNotFoundHandler = defineHandler(
  { route: '/api/[...path]', originCheck: false },
  async () => {
    throw new AppError('NOT_FOUND');
  },
);

// POST /api/cron/process-jobs (api-spec §21.1). Called every minute by the scheduler with the
// cron secret; not a browser, so no origin check.
export const processJobsHandler = defineHandler(
  { route: '/api/cron/process-jobs', originCheck: false },
  async ({ request }) => ok(await runJobQueue(request.headers.get('authorization'))),
);
