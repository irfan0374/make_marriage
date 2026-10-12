import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type {
  addStarterTasksSchema,
  createTaskSchema,
  listTasksQuerySchema,
  StarterKey,
  taskPrioritySchema,
  taskStatusSchema,
  updateTaskSchema,
} from './tasks.schemas';

export type TaskStatus = z.output<typeof taskStatusSchema>;
export type TaskPriority = z.output<typeof taskPrioritySchema>;
export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;
export type ListTasksQuery = z.output<typeof listTasksQuerySchema>;
export type AddStarterTasksInput = z.output<typeof addStarterTasksSchema>;
export type { StarterKey };

/** `tasks` collection (database-design §7.6). */
export interface TaskDocument {
  _id: ObjectId;
  weddingId: ObjectId;
  title: string;
  description: string;
  /** `YYYY-MM-DD` in the wedding's timezone, or `null`. */
  dueDate: string | null;
  /** A member of the wedding, or `null`. Cleared when they leave the team. */
  assigneeUserId: ObjectId | null;
  status: TaskStatus;
  /** Missing on tasks made before priorities existed; read as `medium`. */
  priority?: TaskPriority;
  /** Cleared when the event is deleted. */
  eventId: ObjectId | null;
  completedAt: Date | null;
  createdByUserId: ObjectId;
  /**
   * The last person to create or change the task, and when. Automatic cleanups (an event
   * deleted, someone leaving the team) don't count. Missing on older tasks: the creator.
   */
  editedByUserId?: ObjectId;
  editedAt?: Date;
  source: 'manual' | 'starter';
  /** Which starter task this came from, so the checklist can show "Already added". */
  starterKey: StarterKey | null;
  /** The `dueDate` a reminder was last sent for (reminder job, later). */
  lastReminderFor: string | null;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskPerson {
  userId: string;
  name: string;
}

/** A task as the API returns it (api-spec §4.7). */
export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  /** `null` when unassigned, or when the person has left the team. */
  assignee: TaskPerson | null;
  status: TaskStatus;
  priority: TaskPriority;
  eventId: string | null;
  completedAt: string | null;
  /** `null` if that person's account is gone. */
  createdBy: TaskPerson | null;
  /** Who last changed it (`null` if that account is gone), and when. */
  editedBy: TaskPerson | null;
  editedAt: string;
  source: 'manual' | 'starter';
  starterKey: StarterKey | null;
  createdAt: string;
}

/** One starter checklist item for this wedding (api-spec §12.5). */
export interface StarterTask {
  key: StarterKey;
  title: string;
  suggestedMonthsBefore: number;
  /** Counted back from the wedding date; today if that has already passed. */
  dueDate: string;
  alreadyAdded: boolean;
}
