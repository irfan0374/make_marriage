import 'server-only';
import { AppError } from '@/lib/errors';
import { defineHandler, ok } from '@/lib/http';
import { getHealth, handleResendWebhook, runJobQueue, runScheduledWork } from './system.service';

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

// POST /api/webhooks/resend (api-spec §21.3). Signed by Resend (Svix headers); the raw body is
// needed for the signature, so it's read as text. Not a browser, so no origin check.
export const resendWebhookHandler = defineHandler(
  { route: '/api/webhooks/resend', originCheck: false },
  async ({ request }) =>
    ok(
      await handleResendWebhook(await request.text(), {
        id: request.headers.get('svix-id'),
        timestamp: request.headers.get('svix-timestamp'),
        signature: request.headers.get('svix-signature'),
      }),
    ),
);

// POST /api/cron/daily (api-spec §21.2). Called every hour with the cron secret.
export const scheduledWorkHandler = defineHandler(
  { route: '/api/cron/daily', originCheck: false },
  async ({ request }) => ok(await runScheduledWork(request.headers.get('authorization'))),
);
