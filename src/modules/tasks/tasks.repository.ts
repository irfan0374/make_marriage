import 'server-only';
import { ObjectId, type ClientSession } from 'mongodb';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import { TASKS } from './tasks.indexes';
import type { StarterKey, TaskDocument, TaskPriority, TaskStatus } from './tasks.types';

const scoped = (weddingId: WeddingId) => scopedCollection<TaskDocument>(TASKS, weddingId);

/** Every task of the wedding (at most MAX_TASKS_PER_WEDDING); the service filters and sorts. */
export function listTasks(weddingId: WeddingId) {
  return scoped(weddingId).find({}).toArray();
}

export function countTasks(weddingId: WeddingId, session?: ClientSession) {
  return scoped(weddingId).countDocuments({}, { session });
}

export function findTask(weddingId: WeddingId, taskId: ObjectId, session?: ClientSession) {
  return scoped(weddingId).findOne({ _id: taskId }, { session });
}

/** Starter tasks this wedding already has, so they aren't added twice. */
export async function findStarterKeys(
  weddingId: WeddingId,
  session?: ClientSession,
): Promise<Set<StarterKey>> {
  const docs = await scoped(weddingId)
    .find({ starterKey: { $type: 'string' } }, { projection: { starterKey: 1 }, session })
    .toArray();
  return new Set(docs.flatMap((doc) => (doc.starterKey ? [doc.starterKey] : [])));
}

export interface NewTask {
  title: string;
  description: string;
  dueDate: string | null;
  assigneeUserId: ObjectId | null;
  status: TaskStatus;
  priority: TaskPriority;
  eventId: ObjectId | null;
  createdByUserId: ObjectId;
  source: 'manual' | 'starter';
  starterKey: StarterKey | null;
}

export async function insertTasks(
  weddingId: WeddingId,
  tasks: NewTask[],
  now: Date,
  session: ClientSession,
): Promise<TaskDocument[]> {
  const docs = tasks.map((task) => ({
    _id: new ObjectId(),
    ...task,
    completedAt: task.status === 'done' ? now : null,
    // Creating counts as the first edit.
    editedByUserId: task.createdByUserId,
    editedAt: now,
    lastReminderFor: null,
    schemaVersion: 1 as const,
    createdAt: now,
    updatedAt: now,
  }));
  if (docs.length > 0) await scoped(weddingId).insertMany(docs, { session });
  return docs.map((doc) => ({ ...doc, weddingId }));
}

export type TaskChanges = Partial<
  Pick<
    TaskDocument,
    | 'title'
    | 'description'
    | 'dueDate'
    | 'assigneeUserId'
    | 'status'
    | 'priority'
    | 'eventId'
    | 'completedAt'
    | 'editedByUserId'
    | 'editedAt'
  >
>;

export function updateTask(
  weddingId: WeddingId,
  taskId: ObjectId,
  changes: TaskChanges,
  now: Date,
  session: ClientSession,
) {
  return scoped(weddingId).findOneAndUpdate(
    { _id: taskId },
    { $set: { ...changes, updatedAt: now } },
    { returnDocument: 'after', session },
  );
}

export async function deleteTask(
  weddingId: WeddingId,
  taskId: ObjectId,
  session: ClientSession,
): Promise<boolean> {
  const result = await scoped(weddingId).deleteOne({ _id: taskId }, { session });
  return result.deletedCount === 1;
}

/** An event was deleted: its tasks stay, with no event (database-design §8). */
export async function clearTaskEvent(
  weddingId: WeddingId,
  eventId: ObjectId,
  now: Date,
  session: ClientSession,
) {
  await scoped(weddingId).updateMany(
    { eventId },
    { $set: { eventId: null, updatedAt: now } },
    { session },
  );
}

/** Someone left the team: their tasks become unassigned (database-design §8). */
export async function clearTaskAssignee(
  weddingId: WeddingId,
  userId: ObjectId,
  now: Date,
  session: ClientSession,
) {
  await scoped(weddingId).updateMany(
    { assigneeUserId: userId },
    { $set: { assigneeUserId: null, updatedAt: now } },
    { session },
  );
}

/** People with an open task due on one of `dates` (the reminder run). */
export async function findAssigneesDueOn(weddingId: WeddingId, dates: string[]) {
  const docs = await scoped(weddingId)
    .find(
      { status: { $ne: 'done' }, assigneeUserId: { $type: 'objectId' }, dueDate: { $in: dates } },
      { projection: { assigneeUserId: 1 } },
    )
    .toArray();
  const ids = new Map(docs.map((doc) => [doc.assigneeUserId!.toHexString(), doc.assigneeUserId!]));
  return [...ids.values()];
}

/** One person's open tasks due on or before `lastDate` (overdue included), soonest first. */
export function findOpenTasksDueBy(
  weddingId: WeddingId,
  assigneeUserId: ObjectId,
  lastDate: string,
) {
  return scoped(weddingId)
    .find(
      { status: { $ne: 'done' }, assigneeUserId, dueDate: { $type: 'string', $lte: lastDate } },
      { sort: { dueDate: 1, _id: 1 } },
    )
    .toArray();
}

/** Note which day these tasks were last included in a reminder. */
export async function markReminded(weddingId: WeddingId, taskIds: ObjectId[], day: string) {
  if (taskIds.length === 0) return;
  await scoped(weddingId).updateMany({ _id: { $in: taskIds } }, { $set: { lastReminderFor: day } });
}
