'use client';

import { Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { FormAlert, FormField, FormSelect, FormTextarea } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';
import { Button } from '@/components/ui/button';
import { useCreateTask, useUpdateTask } from '@/features/tasks/hooks';
import { timeAgo } from '@/features/tasks/task-groups';
import type { WeddingEvent } from '@/modules/events/events.types';
import {
  createTaskSchema,
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  TASK_TITLE_MAX,
} from '@/modules/tasks/tasks.schemas';
import type { Task, TaskPriority, TaskStatus, UpdateTaskInput } from '@/modules/tasks/tasks.types';
import type { TeamMember } from '@/modules/team/team.types';
import { cn } from '@/shared/cn';
import { formatDate, todayIn } from '@/shared/dates';

// The Add task / Edit task panel (Stitch "Tasks", "Edit task"). Beside the list on desktop; a
// full-screen sheet on phones and tablets.

export type TaskPanelMode = { kind: 'new'; title?: string } | { kind: 'edit'; task: Task };

interface Values {
  title: string;
  description: string;
  dueDate: string;
  assigneeUserId: string;
  eventId: string;
  status: TaskStatus;
  priority: TaskPriority;
}

/** The chosen priority keeps its badge colour (High red-brown, Medium gold, Low grey). */
const PRIORITY_SELECTED: Record<TaskPriority, string> = {
  high: 'bg-danger-text text-surface',
  medium: 'bg-pending-text text-surface',
  low: 'bg-text-muted text-surface',
};

function initialValues(mode: TaskPanelMode): Values {
  if (mode.kind === 'edit') {
    const t = mode.task;
    return {
      title: t.title,
      description: t.description,
      dueDate: t.dueDate ?? '',
      assigneeUserId: t.assignee?.userId ?? '',
      eventId: t.eventId ?? '',
      status: t.status,
      priority: t.priority,
    };
  }
  return {
    title: mode.title ?? '',
    description: '',
    dueDate: '',
    assigneeUserId: '',
    eventId: '',
    status: 'todo',
    priority: 'medium',
  };
}

function changedFields(values: Values, saved: Values): (keyof Values)[] {
  return (Object.keys(values) as (keyof Values)[]).filter(
    (key) => String(values[key]).trim() !== String(saved[key]).trim(),
  );
}

export function TaskPanel({
  weddingId,
  mode,
  members,
  events,
  timeZone,
  onClose,
  onDelete,
}: {
  weddingId: string;
  mode: TaskPanelMode;
  /** The wedding's timezone, for the day a task was added. */
  timeZone: string;
  members: TeamMember[];
  events: WeddingEvent[];
  onClose: () => void;
  onDelete: (task: Task) => void;
}) {
  // The values the panel opened with; it remounts (by `key`) for another task.
  const [saved] = useState(() => initialValues(mode));
  const [values, setValues] = useState<Values>(saved);
  const create = useCreateTask(weddingId);
  const update = useUpdateTask(weddingId);
  const pending = create.isPending || update.isPending;
  const { formRef, fieldErrors, formError, validate, showError, onInput } = useForm(
    createTaskSchema,
    { ASSIGNEE_NOT_MEMBER: 'assigneeUserId' },
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => panelRef.current?.focus({ preventScroll: true }), []);

  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = validate(values);
    if (!input) return;
    if (mode.kind === 'new') {
      create.mutate(input, { onSuccess: onClose, onError: showError });
      return;
    }
    const changes = changedFields(values, saved);
    if (changes.length === 0) {
      onClose();
      return;
    }
    const patch = Object.fromEntries(changes.map((key) => [key, input[key]])) as UpdateTaskInput;
    update.mutate(
      { taskId: mode.task.id, input: patch },
      { onSuccess: onClose, onError: showError },
    );
  }

  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({
      value: m.user.id,
      label: `${m.user.name} · ${m.role === 'admin' ? 'Admin' : 'Manager'}`,
    })),
  ];
  const eventOptions = [
    { value: '', label: 'No event' },
    ...events.map((e) => ({ value: e.id, label: e.name })),
  ];
  const assigningOther =
    values.assigneeUserId !== '' && values.assigneeUserId !== saved.assigneeUserId;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className={cn(
        'bg-surface flex flex-col outline-none',
        'max-lg:fixed max-lg:inset-0 max-lg:z-50',
        'lg:border-border lg:rounded-card lg:shadow-card lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-hidden lg:border',
      )}
    >
      <div className="border-border/60 flex items-start justify-between gap-3 border-b px-6 py-5">
        <div className="min-w-0">
          <p className="text-pending-text flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] uppercase">
            <span aria-hidden className="bg-pending-text size-1.5 rounded-full" />
            {mode.kind === 'new' ? 'Quick action' : 'Task details'}
          </p>
          <h2 id={titleId} className="mt-1 text-2xl font-normal">
            {mode.kind === 'new' ? 'Add task' : 'Edit task'}
          </h2>
          {mode.kind === 'new' && (
            <p className="text-text-muted mt-1 text-xs">
              Assign a responsibility to family members.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-text-muted hover:text-text hover:bg-background -mr-2 rounded-full p-2"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <form
        ref={formRef}
        onSubmit={submit}
        onInput={onInput}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <FormAlert message={formError} />
          <FormField
            label="Task title *"
            name="title"
            autoComplete="off"
            maxLength={TASK_TITLE_MAX}
            placeholder="e.g. Confirm wedding car decoration"
            value={values.title}
            onChange={(e) => set({ title: e.target.value })}
            error={fieldErrors.title}
            disabled={pending}
          />
          <FormTextarea
            label="Description & notes"
            name="description"
            rows={3}
            maxLength={TASK_DESCRIPTION_MAX}
            placeholder="Add notes, vendor phone numbers, setup times or anything they should know…"
            value={values.description}
            onChange={(e) => set({ description: e.target.value })}
            error={fieldErrors.description}
            disabled={pending}
          />
          <FormField
            label="Due date"
            name="dueDate"
            type="date"
            value={values.dueDate}
            onChange={(e) => set({ dueDate: e.target.value })}
            error={fieldErrors.dueDate}
            disabled={pending}
          />
          <FormSelect
            label="Assign to"
            name="assigneeUserId"
            options={assigneeOptions}
            value={values.assigneeUserId}
            onChange={(e) => set({ assigneeUserId: e.target.value })}
            hint={
              assigningOther
                ? "They'll get an email when you save, and a reminder at 9 AM the day before it's due and on the day."
                : "They'll get an email when you assign it, and a reminder at 9 AM the day before it's due and on the day."
            }
            error={fieldErrors.assigneeUserId}
            disabled={pending}
          />
          <FormSelect
            label="Linked event"
            name="eventId"
            options={eventOptions}
            value={values.eventId}
            onChange={(e) => set({ eventId: e.target.value })}
            error={fieldErrors.eventId}
            disabled={pending}
          />
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Priority</legend>
            <div className="bg-background rounded-input grid grid-cols-3 gap-1 p-1">
              {TASK_PRIORITIES.map((priority) => (
                <button
                  key={priority}
                  type="button"
                  aria-pressed={values.priority === priority}
                  onClick={() => set({ priority })}
                  disabled={pending}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-sm px-2 py-2 text-xs font-medium transition-colors',
                    values.priority === priority
                      ? PRIORITY_SELECTED[priority]
                      : 'text-text-muted hover:bg-surface',
                  )}
                >
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  {TASK_PRIORITY_LABELS[priority]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Status</legend>
            <div className="bg-background rounded-input grid grid-cols-3 gap-1 p-1">
              {TASK_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={values.status === status}
                  onClick={() => set({ status })}
                  disabled={pending}
                  className={cn(
                    'rounded-sm px-2 py-2 text-xs font-medium transition-colors',
                    values.status === status
                      ? 'bg-primary text-primary-foreground'
                      : 'text-text-muted hover:bg-surface',
                  )}
                >
                  {TASK_STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </fieldset>
          {mode.kind === 'edit' && (
            <div className="text-text-muted space-y-0.5 text-xs">
              {mode.task.createdBy && (
                <p>
                  Added by {mode.task.createdBy.name} on{' '}
                  {formatDate(todayIn(timeZone, new Date(mode.task.createdAt)))}
                </p>
              )}
              <p>
                Last updated{mode.task.editedBy ? ` by ${mode.task.editedBy.name}` : ''} ·{' '}
                <time dateTime={mode.task.editedAt}>{timeAgo(mode.task.editedAt, timeZone)}</time>
              </p>
            </div>
          )}
        </div>

        <div className="border-border/60 flex items-center justify-between gap-3 border-t px-6 py-4">
          {mode.kind === 'edit' ? (
            <button
              type="button"
              onClick={() => onDelete(mode.task)}
              disabled={pending}
              className="text-danger-text hover:bg-danger-bg -ml-2 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
            >
              <Trash2 aria-hidden className="size-4" />
              Delete task
            </button>
          ) : (
            <Button type="button" variant="ghost" className="h-11 px-4" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button type="submit" className="h-11 px-6" disabled={pending}>
            {mode.kind === 'new'
              ? create.isPending
                ? 'Creating…'
                : 'Create task'
              : update.isPending
                ? 'Saving…'
                : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
