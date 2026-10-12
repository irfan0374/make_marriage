import 'server-only';
import type { ClientSession, ObjectId } from 'mongodb';
import { createElement } from 'react';
import { withTransaction } from '@/lib/db/transaction';
import { MAX_TASKS_PER_WEDDING } from '@/config/constants';
import { TaskAssignedEmail } from '@/emails/task-assigned';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { toObjectId, type WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { getUsersByIds, type PublicUser } from '@/modules/auth';
import { getEvent } from '@/modules/events';
import {
  isMember,
  listMembers,
  resolveWeddingContext,
  type WeddingContext,
} from '@/modules/members';
import { sendEmail } from '@/modules/notifications';
import { getWeddingBasics, requireWritableWedding, lockWeddingTasks } from '@/modules/weddings';
import { addDays, addMonths, formatDate, todayIn } from '@/shared/dates';
import {
  clearTaskAssignee,
  clearTaskEvent,
  countTasks,
  deleteTask as deleteTaskDoc,
  findStarterKeys,
  findTask,
  insertTasks,
  listTasks as listTaskDocs,
  updateTask as updateTaskDoc,
  type NewTask,
  type TaskChanges,
} from './tasks.repository';
import { STARTER_TASKS } from './tasks.schemas';
import type {
  AddStarterTasksInput,
  CreateTaskInput,
  ListTasksQuery,
  StarterTask,
  Task,
  TaskDocument,
  UpdateTaskInput,
} from './tasks.types';

// The task planner (api-spec §12, PRD TASK-1 to TASK-5). Every member, Admin or Manager, can add,
// edit and complete tasks; an archived wedding is read-only. Assigning a task to someone else
// emails them.

/** Names of the people tasks point at; a person who left the team shows as unassigned. */
async function peopleOf(weddingId: WeddingId, docs: TaskDocument[]) {
  const members = await listMembers(weddingId);
  const memberIds = new Set(members.map((m) => m.userId.toHexString()));
  const ids = new Map<string, ObjectId>();
  for (const doc of docs) {
    if (doc.assigneeUserId) ids.set(doc.assigneeUserId.toHexString(), doc.assigneeUserId);
    ids.set(doc.createdByUserId.toHexString(), doc.createdByUserId);
    if (doc.editedByUserId) ids.set(doc.editedByUserId.toHexString(), doc.editedByUserId);
  }
  const users = await getUsersByIds([...ids.values()]);
  return { users, memberIds };
}

function toTask(
  doc: TaskDocument,
  { users, memberIds }: { users: Map<string, PublicUser>; memberIds: Set<string> },
): Task {
  const assigneeId = doc.assigneeUserId?.toHexString();
  const assignee = assigneeId && memberIds.has(assigneeId) ? users.get(assigneeId) : undefined;
  const creator = users.get(doc.createdByUserId.toHexString());
  const editor = users.get((doc.editedByUserId ?? doc.createdByUserId).toHexString());
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    description: doc.description,
    dueDate: doc.dueDate,
    assignee: assignee ? { userId: assignee.id, name: assignee.name } : null,
    status: doc.status,
    priority: doc.priority ?? 'medium',
    eventId: doc.eventId?.toHexString() ?? null,
    completedAt: doc.completedAt?.toISOString() ?? null,
    createdBy: creator ? { userId: creator.id, name: creator.name } : null,
    editedBy: editor ? { userId: editor.id, name: editor.name } : null,
    editedAt: (doc.editedAt ?? doc.createdAt).toISOString(),
    source: doc.source,
    starterKey: doc.starterKey,
    createdAt: doc.createdAt.toISOString(),
  };
}

async function toTasks(weddingId: WeddingId, docs: TaskDocument[]): Promise<Task[]> {
  const people = await peopleOf(weddingId, docs);
  return docs.map((doc) => toTask(doc, people));
}

/** A member, in a wedding that isn't archived. */
async function requireTaskWriter(token: string | undefined, weddingId: ObjectId) {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await requireWritableWedding(context.weddingId);
  return { context, wedding };
}

/** The assignee must be on the team; the event must be this wedding's. */
async function checkLinks(
  weddingId: WeddingId,
  { assigneeUserId, eventId }: { assigneeUserId?: string | null; eventId?: string | null },
  session: ClientSession,
) {
  if (assigneeUserId && !(await isMember(weddingId, toObjectId(assigneeUserId), session))) {
    throw new AppError('ASSIGNEE_NOT_MEMBER', undefined, {
      details: [{ path: 'assigneeUserId', message: 'Choose someone on the wedding team' }],
    });
  }
  if (eventId && !(await getEvent(weddingId, toObjectId(eventId), session))) {
    throw new AppError('VALIDATION_ERROR', undefined, {
      details: [{ path: 'eventId', message: 'Choose one of this wedding’s events' }],
    });
  }
}

/** Called under the wedding lock; inserting and checking capacity are one transaction. */
async function addTasks(weddingId: WeddingId, tasks: NewTask[], now: Date, session: ClientSession) {
  if ((await countTasks(weddingId, session)) + tasks.length > MAX_TASKS_PER_WEDDING) {
    throw new AppError('TASK_LIMIT_REACHED');
  }
  return insertTasks(weddingId, tasks, now, session);
}

/**
 * Tell someone a task is now theirs (PRD TASK-5). Not when you assign it to yourself. A failed
 * email never fails the save; it's logged by the notifications module.
 */
async function emailAssignee(
  context: WeddingContext,
  wedding: { brideName: string; groomName: string },
  task: TaskDocument,
) {
  if (!task.assigneeUserId || task.assigneeUserId.equals(context.userId)) return;
  const assignee = (await getUsersByIds([task.assigneeUserId])).get(
    task.assigneeUserId.toHexString(),
  );
  if (!assignee) return;
  const event = task.eventId ? await getEvent(context.weddingId, task.eventId) : null;
  const coupleNames = `${wedding.brideName} & ${wedding.groomName}`;
  const tasksUrl = new URL(
    `/app/${context.weddingId.toHexString()}/tasks`,
    getEnv().APP_URL,
  ).toString();
  const result = await sendEmail({
    template: 'task_assigned',
    to: assignee.email,
    subject: `${context.user.name} assigned you: ${task.title}`,
    fromName: context.user.name,
    replyTo: context.user.email,
    weddingId: context.weddingId,
    userId: task.assigneeUserId,
    body: createElement(TaskAssignedEmail, {
      assignerName: context.user.name,
      coupleNames,
      title: task.title,
      dueLine: task.dueDate ? `Due ${formatDate(task.dueDate)}` : undefined,
      eventLine: event ? `For the ${event.name}` : undefined,
      tasksUrl,
    }),
  });
  if (result === 'failed') {
    logger.warn('tasks.assigned_email_failed', {
      weddingId: context.weddingId.toHexString(),
      taskId: task._id.toHexString(),
    });
  }
}

const NO_DATE = '9999-12-31';

/** Due date first (no date last), then newest; or newest first. */
function sortTasks(docs: TaskDocument[], sort: ListTasksQuery['sort']): TaskDocument[] {
  const byCreated = (a: TaskDocument, b: TaskDocument) =>
    b.createdAt.getTime() - a.createdAt.getTime() ||
    b._id.toHexString().localeCompare(a._id.toHexString());
  if (sort === '-createdAt') return [...docs].sort(byCreated);
  return [...docs].sort(
    (a, b) => (a.dueDate ?? NO_DATE).localeCompare(b.dueDate ?? NO_DATE) || byCreated(a, b),
  );
}

export async function listTasks(
  token: string | undefined,
  weddingId: ObjectId,
  query: ListTasksQuery,
  now = new Date(),
): Promise<{ tasks: Task[]; nextCursor: string | null }> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await getWeddingBasics(context.weddingId);
  if (!wedding) throw new AppError('NOT_FOUND');
  const today = todayIn(wedding.timezone, now);
  const weekEnd = addDays(today, 6);
  const docs = await listTaskDocs(context.weddingId);
  const memberIds = new Set(
    (await listMembers(context.weddingId)).map((m) => m.userId.toHexString()),
  );

  const matches = docs.filter((doc) => {
    if (query.status && !query.status.includes(doc.status)) return false;
    if (query.priority && !query.priority.includes(doc.priority ?? 'medium')) return false;
    if (query.eventId && doc.eventId?.toHexString() !== query.eventId.toLowerCase()) return false;
    if (query.assignee) {
      const assignee = doc.assigneeUserId?.toHexString();
      const current = assignee && memberIds.has(assignee) ? assignee : null;
      if (query.assignee === 'none' && current !== null) return false;
      if (query.assignee === 'me' && current !== context.userId.toHexString()) return false;
      if (query.assignee !== 'none' && query.assignee !== 'me') {
        if (current !== query.assignee.toLowerCase()) return false;
      }
    }
    if (query.due === 'none' && doc.dueDate !== null) return false;
    if (query.due === 'overdue' && !(doc.status !== 'done' && doc.dueDate && doc.dueDate < today)) {
      return false;
    }
    if (
      query.due === 'this_week' &&
      !(doc.status !== 'done' && doc.dueDate && doc.dueDate >= today && doc.dueDate <= weekEnd)
    ) {
      return false;
    }
    return true;
  });

  const sorted = sortTasks(matches, query.sort);
  const start = query.cursor ? Number(query.cursor) : 0;
  const page = sorted.slice(start, start + query.limit);
  const nextCursor = start + query.limit < sorted.length ? String(start + query.limit) : null;
  return { tasks: await toTasks(context.weddingId, page), nextCursor };
}

export async function createTask(
  token: string | undefined,
  weddingId: ObjectId,
  input: CreateTaskInput,
  now = new Date(),
): Promise<Task> {
  const { context, wedding } = await requireTaskWriter(token, weddingId);
  const [doc] = await withTransaction(async (session) => {
    await lockWeddingTasks(context.weddingId, session);
    if (!(await isMember(context.weddingId, context.userId, session)))
      throw new AppError('NOT_FOUND');
    await checkLinks(context.weddingId, input, session);
    return addTasks(
      context.weddingId,
      [
        {
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
          assigneeUserId: input.assigneeUserId ? toObjectId(input.assigneeUserId) : null,
          status: input.status,
          priority: input.priority,
          eventId: input.eventId ? toObjectId(input.eventId) : null,
          createdByUserId: context.userId,
          source: 'manual',
          starterKey: null,
        },
      ],
      now,
      session,
    );
  });
  await emailAssignee(context, wedding, doc!);
  return (await toTasks(context.weddingId, [doc!]))[0]!;
}

export async function updateTask(
  token: string | undefined,
  weddingId: ObjectId,
  taskId: ObjectId,
  input: UpdateTaskInput,
  now = new Date(),
): Promise<Task> {
  const { context, wedding } = await requireTaskWriter(token, weddingId);
  const { current, updated, changes } = await withTransaction(async (session) => {
    await lockWeddingTasks(context.weddingId, session);
    if (!(await isMember(context.weddingId, context.userId, session)))
      throw new AppError('NOT_FOUND');
    const current = await findTask(context.weddingId, taskId, session);
    if (!current) throw new AppError('NOT_FOUND');
    await checkLinks(context.weddingId, input, session);

    const changes: TaskChanges = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.description !== undefined) changes.description = input.description;
    if (input.dueDate !== undefined) changes.dueDate = input.dueDate;
    if (input.assigneeUserId !== undefined) {
      changes.assigneeUserId = input.assigneeUserId ? toObjectId(input.assigneeUserId) : null;
    }
    if (input.eventId !== undefined) {
      changes.eventId = input.eventId ? toObjectId(input.eventId) : null;
    }
    if (input.status !== undefined && input.status !== current.status) {
      changes.status = input.status;
      changes.completedAt = input.status === 'done' ? now : null;
    }
    if (input.priority !== undefined) changes.priority = input.priority;
    // Any change by a person updates "Last updated by"; cleanups elsewhere don't.
    if (Object.keys(changes).length > 0) {
      changes.editedByUserId = context.userId;
      changes.editedAt = now;
    }

    const updated = await updateTaskDoc(context.weddingId, taskId, changes, now, session);
    if (!updated) throw new AppError('NOT_FOUND');
    return { current, updated, changes };
  });
  // Only a change of person sends an email, not re-saving the same assignee.
  const reassigned =
    changes.assigneeUserId &&
    !(current.assigneeUserId && changes.assigneeUserId.equals(current.assigneeUserId));
  if (reassigned) await emailAssignee(context, wedding, updated);
  return (await toTasks(context.weddingId, [updated]))[0]!;
}

export async function deleteTask(
  token: string | undefined,
  weddingId: ObjectId,
  taskId: ObjectId,
): Promise<void> {
  const { context } = await requireTaskWriter(token, weddingId);
  await withTransaction(async (session) => {
    await lockWeddingTasks(context.weddingId, session);
    if (!(await isMember(context.weddingId, context.userId, session)))
      throw new AppError('NOT_FOUND');
    if (!(await deleteTaskDoc(context.weddingId, taskId, session))) throw new AppError('NOT_FOUND');
  });
}

/** Each starter task's due date: counted back from the wedding, but never before today. */
function starterDueDate(weddingDate: string, monthsBefore: number, today: string): string {
  const due = addMonths(weddingDate, -monthsBefore);
  return due < today ? today : due;
}

export async function getStarterChecklist(
  token: string | undefined,
  weddingId: ObjectId,
  now = new Date(),
): Promise<StarterTask[]> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await getWeddingBasics(context.weddingId);
  if (!wedding) throw new AppError('NOT_FOUND');
  const today = todayIn(wedding.timezone, now);
  const added = await findStarterKeys(context.weddingId);
  return STARTER_TASKS.map((task) => ({
    key: task.key,
    title: task.title,
    suggestedMonthsBefore: task.monthsBefore,
    dueDate: starterDueDate(wedding.weddingDate, task.monthsBefore, today),
    alreadyAdded: added.has(task.key),
  }));
}

/** Add chosen starter tasks, unassigned. Ones the wedding already has are skipped. */
export async function addStarterTasks(
  token: string | undefined,
  weddingId: ObjectId,
  input: AddStarterTasksInput,
  now = new Date(),
): Promise<Task[]> {
  const { context, wedding } = await requireTaskWriter(token, weddingId);
  const today = todayIn(wedding.timezone, now);
  const docs = await withTransaction(async (session) => {
    await lockWeddingTasks(context.weddingId, session);
    if (!(await isMember(context.weddingId, context.userId, session)))
      throw new AppError('NOT_FOUND');
    const added = await findStarterKeys(context.weddingId, session);
    const chosen = STARTER_TASKS.filter((t) => input.keys.includes(t.key) && !added.has(t.key));
    return addTasks(
      context.weddingId,
      chosen.map((task) => ({
        title: task.title,
        description: '',
        dueDate: starterDueDate(wedding.weddingDate, task.monthsBefore, today),
        assigneeUserId: null,
        status: 'todo' as const,
        priority: 'medium' as const,
        eventId: null,
        createdByUserId: context.userId,
        source: 'starter' as const,
        starterKey: task.key,
      })),
      now,
      session,
    );
  });
  return toTasks(context.weddingId, docs);
}

/** Cleanup when an event is deleted: its tasks keep going, with no event. */
export function unlinkEventFromTasks(
  weddingId: WeddingId,
  eventId: ObjectId,
  session: ClientSession,
  now = new Date(),
) {
  return clearTaskEvent(weddingId, eventId, now, session);
}

/** Cleanup when someone leaves the team: their tasks become unassigned. */
export function unassignTasksOf(
  weddingId: WeddingId,
  userId: ObjectId,
  session: ClientSession,
  now = new Date(),
) {
  return clearTaskAssignee(weddingId, userId, now, session);
}
