import 'server-only';
import type { ObjectId } from 'mongodb';
import { withTransaction } from '@/lib/db/transaction';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { deleteEventRecord, getEvent } from '@/modules/events';
import {
  countAllFamiliesInvitedTo,
  countFamiliesInvitedTo,
  removeEventFromHouseholds,
} from '@/modules/households';
import { resolveWeddingContext } from '@/modules/members';
import { unlinkEventFromTasks } from '@/modules/tasks';
import { requireWritableWedding, lockWeddingTasks } from '@/modules/weddings';

// Deletes that reach across modules (database-design §8). This module sits above the ones it
// tidies, so they never need to import each other: events don't know about tasks, and tasks only
// read events. Expenses, vendors and photos join the event cleanup as they're built.

/**
 * DELETE event (api-spec §8.5): the event goes, and in the same transaction its tasks lose their
 * event link and it comes off every family (their replies for it are archived). When families are invited to it, the caller must confirm first, because their
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
  const event = await getEvent(context.weddingId, eventId);
  if (!event) throw new AppError('NOT_FOUND');
  // Any invited family means confirming first; the count shown is the families this person can
  // see (a side-limited Manager isn't told about the other side's families).
  if (!confirm && (await countAllFamiliesInvitedTo(context.weddingId, eventId)) > 0) {
    const affectedHouseholds = await countFamiliesInvitedTo(context, eventId);
    throw new AppError('CONFIRMATION_REQUIRED', undefined, { details: { affectedHouseholds } });
  }
  await withTransaction(async (session) => {
    await lockWeddingTasks(context.weddingId, session);
    if (!(await deleteEventRecord(context.weddingId, eventId, session))) {
      throw new AppError('NOT_FOUND');
    }
    await unlinkEventFromTasks(context.weddingId, eventId, session);
    await removeEventFromHouseholds(context.weddingId, eventId, event.name, session);
  });
  logger.info('cleanup.event_deleted', {
    weddingId: context.weddingId.toHexString(),
    eventId: eventId.toHexString(),
  });
}
