'use client';

import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  ListChecks,
  ListPlus,
  Plus,
  Search,
  Sunrise,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useEvents } from '@/features/events/hooks';
import {
  filterTasks,
  groupTasks,
  hasFilters,
  NO_FILTERS,
  taskStats,
  weekEnd,
  type TaskFilters,
} from '@/features/tasks/task-groups';
import { useTasks, useUpdateTask, usePendingTaskIds } from '@/features/tasks/hooks';
import { useTeam } from '@/features/team/hooks';
import { useMe, useWedding } from '@/features/weddings/hooks';
import {
  STARTER_TASKS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
} from '@/modules/tasks/tasks.schemas';
import type { Task, TaskStatus } from '@/modules/tasks/tasks.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { formatDate, todayIn } from '@/shared/dates';
import { DeleteTaskDialog } from './delete-task-dialog';
import { StarterDialog } from './starter-dialog';
import { TaskPanel, type TaskPanelMode } from './task-panel';
import { TaskRow } from './task-row';

// The Tasks page (Stitch "Tasks", "Tasks (Empty)", "Tasks (No results)"; PRD TASK-1 to TASK-3):
// who does what for each celebration, grouped by when it's due.

const card = 'border-border bg-surface rounded-card shadow-card border';
const chip = 'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors';

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'danger';
}) {
  return (
    <div
      className={cn(card, 'p-4 sm:p-5', tone === 'danger' && 'border-danger-text/20 bg-danger-bg')}
    >
      <p
        className={cn(
          'text-[11px] font-semibold tracking-wider uppercase',
          tone === 'danger' ? 'text-danger-text' : 'text-text-muted',
        )}
      >
        {label}
      </p>
      <p className={cn('font-heading mt-1 text-3xl', tone === 'danger' && 'text-danger-text')}>
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  onStarter,
  onAdd,
}: {
  onStarter: () => void;
  onAdd: (title?: string) => void;
}) {
  const popular = STARTER_TASKS.filter((t) =>
    [
      'book_venue',
      'book_photographer',
      'book_caterer',
      'order_invitations',
      'book_mehendi_artist',
      'plan_menu_tasting',
    ].includes(t.key),
  );
  return (
    <section className={cn(card, 'mx-auto mt-4 max-w-2xl px-6 py-12 text-center sm:px-10')}>
      <span className="bg-primary-tint text-primary mx-auto flex size-16 items-center justify-center rounded-full">
        <ListChecks aria-hidden className="size-7" />
      </span>
      <h2 className="mt-6 text-3xl">Plan who does what</h2>
      <p className="text-text-muted mx-auto mt-3 max-w-md">
        Add tasks for each celebration and assign them to family members. Everyone sees what&apos;s
        left to do.
      </p>
      <Button className="mt-7 h-12 gap-2 px-6 text-base" onClick={onStarter}>
        <ListPlus aria-hidden className="size-4" />
        Start with our checklist
      </Button>
      <p className="mt-4">
        <button
          type="button"
          onClick={() => onAdd()}
          className="text-sm font-medium underline underline-offset-4 hover:no-underline"
        >
          Or add your own task
        </button>
      </p>
      <div className="border-border/70 mt-8 border-t pt-7">
        <p className="text-text-muted text-xs font-semibold tracking-[0.1em] uppercase">
          Popular wedding tasks
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {popular.map((task) => (
            <button
              key={task.key}
              type="button"
              onClick={() => onAdd(task.title)}
              className="border-border hover:border-primary/40 hover:text-primary rounded-full border px-3.5 py-1.5 text-sm transition-colors"
            >
              {task.title}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Group({
  icon: Icon,
  title,
  count,
  note,
  tone,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  note?: string;
  tone?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <section aria-label={`${title}, ${count} ${count === 1 ? 'task' : 'tasks'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-normal">
          <Icon
            aria-hidden
            className={cn('size-5', tone === 'danger' ? 'text-danger-text' : 'text-pending-text')}
          />
          {title}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-sans text-[11px] font-medium',
              tone === 'danger'
                ? 'bg-danger-bg text-danger-text'
                : 'bg-background-alt text-text-muted',
            )}
          >
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        </h2>
        {note && <p className="text-text-muted hidden text-xs sm:block">{note}</p>}
      </div>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

export function TasksPage({ weddingId }: { weddingId: string }) {
  const { data: wedding } = useWedding(weddingId);
  const { data: me } = useMe();
  const { data: tasks, error, isPending, refetch } = useTasks(weddingId);
  const { data: events } = useEvents(weddingId);
  const { data: team } = useTeam(weddingId);
  const update = useUpdateTask(weddingId);
  const pendingTaskIds = usePendingTaskIds(weddingId);
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [panel, setPanel] = useState<TaskPanelMode | null>(null);
  const [starter, setStarter] = useState(false);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(true);

  if (isPending || !wedding) {
    return (
      <p role="status" className="text-text-muted py-20 text-center">
        Loading your tasks…
      </p>
    );
  }
  if (error) {
    return (
      <div role="alert" className="space-y-3 py-20 text-center">
        <h1 className="text-2xl">We couldn&apos;t load your tasks</h1>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-primary font-medium hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const today = todayIn(wedding.timezone);
  const members = team?.members ?? [];
  const eventList = events ?? [];
  const eventName = (id: string | null) =>
    id ? eventList.find((e) => e.id === id)?.name : undefined;
  const myUserId = me?.user.id;
  const stats = taskStats(tasks, today);
  const visible = filterTasks(tasks, filters, { today, myUserId });
  const groups = groupTasks(visible, today);
  const mine = tasks.filter((t) => t.assignee?.userId === myUserId).length;
  const editingId = panel?.kind === 'edit' ? panel.task.id : null;

  function openPanel(mode: TaskPanelMode) {
    if (panel && document.querySelector('[data-task-panel-dirty="true"]')) {
      if (!window.confirm('Discard your changes to this task?')) return;
    }
    setPanel(mode);
  }

  const setStatus = (task: Task) => (status: TaskStatus) => {
    if (status !== task.status) update.mutate({ taskId: task.id, input: { status } });
  };

  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      pending={pendingTaskIds.includes(task.id)}
      today={today}
      timeZone={wedding.timezone}
      eventName={eventName(task.eventId)}
      editing={editingId === task.id}
      onEdit={() => openPanel({ kind: 'edit', task })}
      onDelete={() => setDeleting(task)}
      onStatus={setStatus(task)}
    />
  );

  const statusError =
    update.error && !panel
      ? update.error instanceof ApiError
        ? update.error.message
        : "The change couldn't be saved. Please try again."
      : null;
  const select =
    'border-border bg-surface hover:border-primary/40 h-8 rounded-full border pr-8 pl-3.5 text-xs font-medium appearance-none';

  return (
    <div className="pb-16">
      {tasks.length > 0 && (
        <section
          aria-label="Summary"
          className="mb-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4"
        >
          <StatCard label="Open tasks" value={stats.open} />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            tone={stats.overdue > 0 ? 'danger' : undefined}
          />
          <StatCard label="Due this week" value={stats.dueThisWeek} />
          <StatCard
            label="Done"
            value={
              <>
                {stats.done}
                <span className="text-text-muted font-sans text-sm"> of {stats.total}</span>
              </>
            }
          />
        </section>
      )}

      <div className={cn('grid gap-8', panel && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
        <div className="min-w-0">
          <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-pending-text mb-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
                {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
              </p>
              <h1 className="text-4xl font-normal tracking-tight md:text-5xl">Tasks</h1>
              <p className="text-text-muted mt-2">Plan who does what for each celebration.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                className="border-border bg-surface h-10 gap-2 px-4 font-medium"
                onClick={() => setStarter(true)}
              >
                <ListPlus aria-hidden className="size-4" />
                Starter checklist
              </Button>
              <Button className="h-10 gap-2 px-5" onClick={() => openPanel({ kind: 'new' })}>
                <Plus aria-hidden className="size-4" />
                Add task
              </Button>
            </div>
          </header>

          {tasks.length === 0 ? (
            !panel && (
              <EmptyState
                onStarter={() => setStarter(true)}
                onAdd={(title) => openPanel({ kind: 'new', title })}
              />
            )
          ) : (
            <>
              <div className={cn(card, 'mb-6 space-y-3 p-3 sm:p-4')}>
                <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                  {(
                    [
                      { view: 'all', label: `All tasks (${tasks.length})` },
                      { view: 'mine', label: `My tasks (${mine})` },
                      { view: 'overdue', label: `Overdue (${stats.overdue})` },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.view}
                      type="button"
                      aria-pressed={filters.view === option.view}
                      onClick={() => setFilters((f) => ({ ...f, view: option.view }))}
                      className={cn(
                        chip,
                        'shrink-0 whitespace-nowrap',
                        filters.view === option.view
                          ? 'bg-primary text-primary-foreground'
                          : option.view === 'overdue' && stats.overdue > 0
                            ? 'bg-danger-bg text-danger-text'
                            : 'bg-background-alt text-text hover:bg-primary-tint',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                  <select
                    aria-label="Filter by status"
                    className={select}
                    value={filters.status ?? ''}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        status: (e.target.value || null) as TaskFilters['status'],
                      }))
                    }
                  >
                    <option value="">Status: All</option>
                    <option value="todo">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                  <select
                    aria-label="Filter by due date"
                    className={select}
                    value={filters.due ?? ''}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        due: (e.target.value || null) as TaskFilters['due'],
                      }))
                    }
                  >
                    <option value="">Due: All</option>
                    <option value="overdue">Overdue</option>
                    <option value="this_week">Due this week</option>
                    <option value="none">No due date</option>
                  </select>
                  <span className="relative shrink-0">
                    <select
                      aria-label="Filter by who it's assigned to"
                      value={filters.assignee ?? ''}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, assignee: e.target.value || null }))
                      }
                      className={select}
                    >
                      <option value="">Assignee: All</option>
                      <option value="none">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.user.id} value={m.user.id}>
                          {m.user.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden
                      className="text-text-muted pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2"
                    />
                  </span>
                  <span className="relative shrink-0">
                    <select
                      aria-label="Filter by event"
                      value={filters.eventId ?? ''}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, eventId: e.target.value || null }))
                      }
                      className={select}
                    >
                      <option value="">Event: All events</option>
                      <option value="none">No event</option>
                      {eventList.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden
                      className="text-text-muted pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2"
                    />
                  </span>
                  <span className="relative shrink-0">
                    <select
                      aria-label="Filter by priority"
                      value={filters.priority ?? ''}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          priority: (e.target.value || null) as TaskFilters['priority'],
                        }))
                      }
                      className={select}
                    >
                      <option value="">Priority: All</option>
                      {TASK_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {TASK_PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden
                      className="text-text-muted pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2"
                    />
                  </span>
                </div>
                <label className="bg-background flex max-w-sm items-center gap-2 rounded-full px-3.5 py-2">
                  <Search aria-hidden className="text-text-muted size-4" />
                  <span className="sr-only">Search tasks</span>
                  <input
                    type="search"
                    value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    placeholder="Search tasks…"
                    className="placeholder:text-text-muted w-full bg-transparent text-sm outline-none"
                  />
                </label>
              </div>

              {statusError && (
                <p
                  role="alert"
                  className="bg-danger-bg text-danger-text rounded-input mb-5 px-4 py-3 text-sm"
                >
                  {statusError}
                </p>
              )}

              {visible.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <Search aria-hidden className="text-text-muted size-6" />
                  <p className="font-medium">No tasks match these filters</p>
                  {hasFilters(filters) && (
                    <button
                      type="button"
                      onClick={() => setFilters(NO_FILTERS)}
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {groups.overdue.length > 0 && (
                    <Group
                      icon={AlertCircle}
                      title="Overdue"
                      count={groups.overdue.length}
                      note="Needs attention"
                      tone="danger"
                    >
                      {groups.overdue.map(row)}
                    </Group>
                  )}
                  {groups.thisWeek.length > 0 && (
                    <Group
                      icon={CalendarDays}
                      title="This week"
                      count={groups.thisWeek.length}
                      note={`Due by ${formatDate(weekEnd(today))}`}
                    >
                      {groups.thisWeek.map(row)}
                    </Group>
                  )}
                  {groups.later.length > 0 && (
                    <Group icon={Sunrise} title="Later" count={groups.later.length}>
                      {groups.later.map(row)}
                    </Group>
                  )}
                  {groups.done.length > 0 && (
                    <section className="bg-background-alt/60 rounded-card p-4 sm:p-5">
                      <button
                        type="button"
                        aria-expanded={showDone}
                        onClick={() => setShowDone((v) => !v)}
                        className="flex w-full items-center justify-between gap-3"
                      >
                        <span className="font-heading flex items-center gap-2 text-2xl">
                          <CircleCheck aria-hidden className="text-pending-text size-5" />
                          Done
                          <span className="bg-surface text-text-muted rounded-full px-2 py-0.5 font-sans text-[11px] font-medium">
                            {groups.done.length} completed
                          </span>
                        </span>
                        <ChevronDown
                          aria-hidden
                          className={cn('size-5 transition-transform', showDone && 'rotate-180')}
                        />
                      </button>
                      {showDone && <ul className="mt-4 space-y-2">{groups.done.map(row)}</ul>}
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {panel && (
          <TaskPanel
            key={panel.kind === 'edit' ? panel.task.id : `new-${panel.title ?? ''}`}
            weddingId={weddingId}
            mode={panel}
            members={members}
            events={eventList}
            timeZone={wedding.timezone}
            onClose={() => setPanel(null)}
            onDelete={setDeleting}
          />
        )}
      </div>

      {starter && (
        <StarterDialog
          weddingId={weddingId}
          weddingDate={wedding.weddingDate}
          onClose={() => setStarter(false)}
        />
      )}
      {deleting && (
        <DeleteTaskDialog
          weddingId={weddingId}
          task={deleting}
          eventName={eventName(deleting.eventId)}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}
