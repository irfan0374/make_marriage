import 'server-only';
import { getDb } from '@/lib/db/client';

/** Round-trip to the database. Throws if it can't be reached. */
export async function pingDatabase(): Promise<void> {
  await getDb().command({ ping: 1 });
}
