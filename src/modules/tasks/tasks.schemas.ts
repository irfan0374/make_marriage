import { z } from 'zod';
import { objectIdString } from '@/shared/validation';

// Client-safe: the task panel, filters and starter checklist validate with these same schemas
// (api-spec §12, database-design §7.6).

export const TASK_TITLE_MAX = 120;
export const TASK_DESCRIPTION_MAX = 2000;

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);

export const TASK_STATUS_LABELS: Record<(typeof TASK_STATUSES)[number], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);

export const TASK_PRIORITY_LABELS: Record<(typeof TASK_PRIORITIES)[number], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/**
 * The starter checklist (PRD TASK-3): common tasks for an Indian wedding, each due a number of
 * months before the wedding day. Keys are stable; titles can change.
 */
export const STARTER_TASKS = [
  { key: 'book_venue', title: 'Book the venue', monthsBefore: 10 },
  { key: 'set_guest_count', title: 'Set the guest list size', monthsBefore: 9 },
  { key: 'book_photographer', title: 'Book the photographer', monthsBefore: 8 },
  { key: 'book_caterer', title: 'Book the caterer', monthsBefore: 6 },
  { key: 'book_decor', title: 'Book decor', monthsBefore: 6 },
  { key: 'book_mehendi_artist', title: 'Book mehendi artist', monthsBefore: 5 },
  { key: 'shop_outfits', title: 'Shop for wedding outfits', monthsBefore: 5 },
  { key: 'order_invitations', title: 'Order invitation cards', monthsBefore: 4 },
  { key: 'book_makeup_artist', title: 'Book makeup artist', monthsBefore: 4 },
  { key: 'book_music', title: 'Book DJ or band', monthsBefore: 4 },
  { key: 'plan_menu_tasting', title: 'Plan the menu tasting', monthsBefore: 3 },
  { key: 'book_transport', title: 'Arrange guest transport', monthsBefore: 2 },
  { key: 'send_invitations', title: 'Send invitations', monthsBefore: 2 },
  { key: 'confirm_vendors', title: 'Confirm all vendors', monthsBefore: 1 },
  { key: 'plan_seating', title: 'Plan seating', monthsBefore: 1 },
] as const;

export type StarterKey = (typeof STARTER_TASKS)[number]['key'];
export const starterKeySchema = z.enum(
  STARTER_TASKS.map((t) => t.key) as [StarterKey, ...StarterKey[]],
);

const titleField = z
  .string()
  .trim()
  .min(1, { message: 'Enter what needs doing', abort: true })
  .max(TASK_TITLE_MAX, `Use at most ${TASK_TITLE_MAX} characters`);

const descriptionField = z
  .string()
  .trim()
  .max(TASK_DESCRIPTION_MAX, `Use at most ${TASK_DESCRIPTION_MAX} characters`);

/** Empty or `null` means "no due date". */
const dueDateField = z
  .union([z.literal(''), z.null(), z.iso.date('Enter a valid date')])
  .transform((value) => (value ? value : null));

/** An id, or empty / `null` for "none" (unassigned, no event). */
const optionalId = z
  .union([z.literal(''), z.null(), objectIdString])
  .transform((value) => (value ? value.toLowerCase() : null));

// POST /api/weddings/{weddingId}/tasks (api-spec §12.2).
export const createTaskSchema = z.strictObject({
  title: titleField,
  description: descriptionField.default(''),
  dueDate: dueDateField.default(null),
  assigneeUserId: optionalId.default(null),
  eventId: optionalId.default(null),
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema.default('medium'),
});

// PATCH /api/weddings/{weddingId}/tasks/{taskId} (api-spec §12.3): any subset.
export const updateTaskSchema = z
  .strictObject({
    title: titleField.optional(),
    description: descriptionField.optional(),
    dueDate: dueDateField.optional(),
    assigneeUserId: optionalId.optional(),
    eventId: optionalId.optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field' });

// GET /api/weddings/{weddingId}/tasks (api-spec §12.1).
export const listTasksQuerySchema = z.strictObject({
  status: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      const parts = value.split(',');
      const parsed = z.array(taskStatusSchema).safeParse(parts);
      if (!parsed.success) {
        ctx.issues.push({ code: 'custom', input: value, message: 'Unknown status' });
        return z.NEVER;
      }
      return parsed.data;
    }),
  priority: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      const parsed = z.array(taskPrioritySchema).safeParse(value.split(','));
      if (!parsed.success) {
        ctx.issues.push({ code: 'custom', input: value, message: 'Unknown priority' });
        return z.NEVER;
      }
      return parsed.data;
    }),
  assignee: z.union([z.literal('me'), z.literal('none'), objectIdString]).optional(),
  eventId: objectIdString.optional(),
  due: z.enum(['overdue', 'this_week', 'none']).optional(),
  sort: z.enum(['dueDate', '-createdAt']).default('dueDate'),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  cursor: z
    .string()
    .regex(/^\d{1,4}$/, 'Invalid cursor')
    .optional(),
});

// POST /api/weddings/{weddingId}/tasks/starter-checklist (api-spec §12.6).
export const addStarterTasksSchema = z.strictObject({
  keys: z
    .array(starterKeySchema)
    .min(1, 'Choose at least one task')
    .max(STARTER_TASKS.length)
    .refine((keys) => new Set(keys).size === keys.length, 'Each task can appear only once'),
});
