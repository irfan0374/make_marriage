import 'server-only';
import type { ObjectId } from 'mongodb';
import { withTransaction } from '@/lib/db/transaction';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { deleteEventRecord, getEvent } from '@/modules/events';
import { resolveWeddingContext } from '@/modules/members';
import { unlinkEventFromTasks } from '@/modules/tasks';
import { requireWritableWedding, lockWeddingTasks } from '@/modules/weddings';

// Deletes that reach across modules (database-design §8). This module sits above the ones it
// tidies, so they never need to import each other: events don't know about tasks, and tasks only
// read events. Guests, expenses, vendors and photos join the event cleanup as they're built.

/**
 * Households invited to an event. Guests and invitations aren't built yet, so none can be;
 * this becomes a households lookup with them (api-spec §8.5).
 */
async function invitedHouseholdCount(): Promise<number> {
  return 0;
}

/**
 * DELETE event (api-spec §8.5): the event goes, and in the same transaction its tasks lose their
 * event link. When families are invited to it, the caller must confirm first, because their
 * replies for it go too.
 */
export async function deleteEvent(
  token: string | undefined,
  weddingId: ObjectId,
  eventId: ObjectId,
  confirm: boolean,
): Promise<void> {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  if (!(await getEvent(context.weddingId, eventId))) throw new AppError('NOT_FOUND');
  const affectedHouseholds = await invitedHouseholdCount();
  if (affectedHouseholds > 0 && !confirm) {
    throw new AppError('CONFIRMATION_REQUIRED', undefined, { details: { affectedHouseholds } });
  }
  await withTransaction(async (session) => {
    await lockWeddingTasks(context.weddingId, session);
    if (!(await deleteEventRecord(context.weddingId, eventId, session))) {
      throw new AppError('NOT_FOUND');
    }
    await unlinkEventFromTasks(context.weddingId, eventId, session);
  });
  logger.info('cleanup.event_deleted', {
    weddingId: context.weddingId.toHexString(),
    eventId: eventId.toHexString(),
  });
}
