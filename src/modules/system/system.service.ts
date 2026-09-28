import 'server-only';
import { logger } from '@/lib/logger';
import { pingDatabase } from './system.repository';
import type { Health } from './system.types';

export async function getHealth(): Promise<Health> {
  const time = new Date().toISOString();
  try {
    await pingDatabase();
    return { status: 'ok', db: 'ok', time };
  } catch (error) {
    logger.error('health.db_unreachable', { err: error });
    return { status: 'error', db: 'down', time };
  }
}
