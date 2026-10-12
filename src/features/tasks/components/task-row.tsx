'use client';

import { Menu } from '@base-ui/react/menu';
import { CalendarDays, Check, ChevronDown, Clock, MoreVertical, UserRound } from 'lucide-react';
import { initials } from '@/features/weddings/components/account-menu';
import { dueLabel, timeAgo } from '@/features/tasks/task-groups';
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
} from '@/modules/tasks/tasks.schemas';
import type { Task, TaskPriority, TaskStatus } from '@/modules/tasks/tasks.types';
import { cn } from '@/shared/cn';

// One task in the list (Stitch "Tasks"): tick box, title, event and due date, who it's for, a
// status pill to change it, and a ⋮ menu.

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: 'bg-background-alt text-text-muted',
  in_progress: 'bg-pending-bg text-pending-text',
  done: 'bg-background-alt text-text-muted',
};

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  high: 'bg-danger-bg text-danger-text',
  medium: 'bg-pending-bg text-pending-text',
  low: 'bg-background-alt text-text-muted',
};

/** High (red-brown), Medium (gold), Low (grey). */
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-semibold',
        PRIORITY_STYLE[priority],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {TASK_PRIORITY_LABELS[priority]}
      <span className="sr-only"> priority</span>
    </span>
  );
}

const menuPopup =
  'border-border bg-surface rounded-input min-w-40 border p-1 shadow-lg outline-none';
const menuItem =
  'data-[highlighted]:bg-background flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none';

export function Avatar({ name, faded }: { name: string; faded?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
        faded && 'opacity-50',
      )}
    >
      {initials(name)}
    </span>
  );
}

export function TaskRow({
  task,
  pending,
  today,
  timeZone,
  eventName,
  editing,
  onEdit,
  onDelete,
  onStatus,
}: {
  task: Task;
  pending: boolean;
  today: string;
  timeZone: string;
  /** The linked event's name; `undefined` when there's none. */
  eventName: string | undefined;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: TaskStatus) => void;
}) {
  const done = task.status === 'done';
  const due = dueLabel(task, today, timeZone);
  const checkboxId = `task-${task.id}`;

  return (
    <li
      className={cn(
        'border-border bg-surface rounded-input flex items-start gap-3 border p-4 transition-shadow sm:items-center sm:gap-4',
        editing && 'border-l-primary border-l-4 shadow-md',
        done && 'bg-background',
      )}
    >
      <input
        id={checkboxId}
        type="checkbox"
        disabled={pending}
        checked={done}
        onChange={(e) => onStatus(e.target.checked ? 'done' : 'todo')}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className="accent-primary mt-0.5 size-5 shrink-0 cursor-pointer sm:mt-0"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onEdit}
            className={cn(
              'min-w-0 truncate text-left text-[15px] font-medium hover:underline',
              done && 'text-text-muted line-through',
            )}
          >
            {task.title}
          </button>
          {editing && (
            <span className="bg-primary text-primary-foreground shrink-0 rounded-sm px-2 py-0.5 text-[11px] font-medium">
              Editing
            </span>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {!done && <PriorityBadge priority={task.priority} />}
          {eventName && (
            <span className="bg-primary-tint text-primary rounded-sm px-2 py-0.5 font-medium">
              {eventName}
            </span>
          )}
          {due && (
            <span
              className={cn(
                'flex items-center gap-1',
                due.tone === 'overdue' ? 'text-danger-text' : 'text-text-muted',
              )}
            >
              {due.tone === 'overdue' ? (
                <Clock aria-hidden className="size-3.5" />
              ) : due.tone === 'soon' ? (
                <CalendarDays aria-hidden className="size-3.5" />
              ) : null}
              {due.text}
            </span>
          )}
        </p>
        <p className="text-text-muted/80 mt-1 text-[11px]">
          Updated{task.editedBy ? ` by ${task.editedBy.name}` : ''} ·{' '}
          <time dateTime={task.editedAt}>{timeAgo(task.editedAt, timeZone)}</time>
        </p>
        {/* Phones: who and status sit under the title. */}
        <div className="mt-2 flex items-center gap-3 sm:hidden">
          <Assignee task={task} />
          <StatusMenu status={task.status} pending={pending} onChange={onStatus} />
        </div>
      </div>

      <div className="hidden items-center gap-4 sm:flex">
        <Assignee task={task} />
        <StatusMenu status={task.status} pending={pending} onChange={onStatus} />
      </div>

      <Menu.Root>
        <Menu.Trigger
          disabled={pending}
          aria-label={`More actions for "${task.title}"`}
          className="text-text-muted hover:bg-background-alt hover:text-text -mr-1 shrink-0 rounded-full p-1.5"
        >
          <MoreVertical aria-hidden className="size-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={6}>
            <Menu.Popup className={menuPopup}>
              <Menu.Item className={menuItem} onClick={onEdit}>
                Edit
              </Menu.Item>
              <Menu.Item className={menuItem} onClick={() => onStatus(done ? 'todo' : 'done')}>
                {done ? 'Mark as not done' : 'Mark as done'}
              </Menu.Item>
              <Menu.Item className={cn(menuItem, 'text-danger-text')} onClick={onDelete}>
                Delete
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </li>
  );
}

function Assignee({ task }: { task: Task }) {
  if (!task.assignee) {
    return (
      <span className="text-text-muted flex w-28 items-center gap-2 text-xs">
        <span
          aria-hidden
          className="border-border flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed"
        >
          <UserRound className="size-3.5" />
        </span>
        Unassigned
      </span>
    );
  }
  return (
    <span className="flex w-28 min-w-0 items-center gap-2 text-xs">
      <Avatar name={task.assignee.name} faded={task.status === 'done'} />
      <span className="truncate">{task.assignee.name}</span>
    </span>
  );
}

function StatusMenu({
  status,
  pending,
  onChange,
}: {
  status: TaskStatus;
  pending: boolean;
  onChange: (status: TaskStatus) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={pending}
        aria-label={`Status: ${TASK_STATUS_LABELS[status]}. Change status`}
        className={cn(
          'flex w-28 shrink-0 items-center justify-between gap-1 rounded-full px-3 py-1 text-xs font-medium',
          STATUS_STYLE[status],
        )}
      >
        {TASK_STATUS_LABELS[status]}
        <ChevronDown aria-hidden className="size-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={6}>
          <Menu.Popup className={menuPopup}>
            {TASK_STATUSES.map((option) => (
              <Menu.Item key={option} className={menuItem} onClick={() => onChange(option)}>
                <Check
                  aria-hidden
                  className={cn('size-3.5', option === status ? 'opacity-100' : 'opacity-0')}
                />
                {TASK_STATUS_LABELS[option]}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
