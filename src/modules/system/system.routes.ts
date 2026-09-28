import 'server-only';
import { ok } from '@/lib/http/envelope';
import { defineHandler } from '@/lib/http/handler';
import { getHealth } from './system.service';

// GET /api/health (api-spec §21.4). Public; 503 when the database is unreachable.
export const getHealthHandler = defineHandler({ route: '/api/health' }, async () => {
  const health = await getHealth();
  return ok(health, undefined, health.db === 'ok' ? 200 : 503);
});
