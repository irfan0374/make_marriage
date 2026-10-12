import type { Task } from '@/modules/tasks/tasks.types';
import { addDays, todayIn } from '@/shared/dates';

// How the Tasks page sorts and filters (Stitch "Tasks"). Client-safe and pure, so the page and
// the dashboard agree. `today` is the wedding's date (its timezone), `YYYY-MM-DD`.

export type TaskGroupKey = 'overdue' | 'thisWeek' | 'later' | 'done';

export interface TaskGroups {
  overdue: Task[];
  thisWeek: Task[];
  later: Task[];
  done: Task[];
}

/** The last day of "This week": today and the six days after it. */
export function weekEnd(today: string): string {
  return addDays(today, 6);
}

export function isOverdue(task: Task, today: string): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate < today;
}

export function isDueThisWeek(task: Task, today: string): boolean {
  return (
    task.status !== 'done' &&
    task.dueDate !== null &&
    task.dueDate >= today &&
    task.dueDate <= weekEnd(today)
  );
}

const NO_DATE = '9999-12-31';
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
/** High priority first, then by due date (no date last), then newest. */
const byDue = (a: Task, b: Task) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
  (a.dueDate ?? NO_DATE).localeCompare(b.dueDate ?? NO_DATE) ||
  b.createdAt.localeCompare(a.createdAt);
const byCompleted = (a: Task, b: Task) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '');

export function groupTasks(tasks: readonly Task[], today: string): TaskGroups {
  const groups: TaskGroups = { overdue: [], thisWeek: [], later: [], done: [] };
  for (const task of tasks) {
    if (task.status === 'done') groups.done.push(task);
    else if (isOverdue(task, today)) groups.overdue.push(task);
    else if (isDueThisWeek(task, today)) groups.thisWeek.push(task);
    else groups.later.push(task);
  }
  groups.overdue.sort(byDue);
  groups.thisWeek.sort(byDue);
  groups.later.sort(byDue);
  groups.done.sort(byCompleted);
  return groups;
}

export interface TaskStats {
  open: number;
  overdue: number;
  dueThisWeek: number;
  done: number;
  total: number;
}

export function taskStats(tasks: readonly Task[], today: string): TaskStats {
  const groups = groupTasks(tasks, today);
  return {
    open: tasks.length - groups.done.length,
    overdue: groups.overdue.length,
    dueThisWeek: groups.thisWeek.length,
    done: groups.done.length,
    total: tasks.length,
  };
}

export type TaskView = 'all' | 'mine' | 'overdue';

export interface TaskFilters {
  view: TaskView;
  status?: Task['status'] | null;
  priority?: Task['priority'] | null;
  due?: 'overdue' | 'this_week' | 'none' | null;
  /** A user id, `'none'` for unassigned, or `null` for everyone. */
  assignee: string | null;
  /** An event id, `'none'` for no event, or `null` for all. */
  eventId: string | null;
  search: string;
}

export const NO_FILTERS: TaskFilters = { view: 'all', assignee: null, eventId: null, search: '' };

export function hasFilters(filters: TaskFilters): boolean {
  return (
    Boolean(filters.status) ||
    Boolean(filters.priority) ||
    Boolean(filters.due) ||
    filters.view !== 'all' ||
    filters.assignee !== null ||
    filters.eventId !== null ||
    filters.search.trim() !== ''
  );
}

export function filterTasks(
  tasks: readonly Task[],
  filters: TaskFilters,
  { today, myUserId }: { today: string; myUserId: string | undefined },
): Task[] {
  const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.due === 'overdue' && !isOverdue(task, today)) return false;
    if (filters.due === 'this_week' && !isDueThisWeek(task, today)) return false;
    if (filters.due === 'none' && task.dueDate !== null) return false;
    if (filters.view === 'mine' && task.assignee?.userId !== myUserId) return false;
    if (filters.view === 'overdue' && !isOverdue(task, today)) return false;
    if (filters.assignee === 'none' && task.assignee) return false;
    if (
      filters.assignee &&
      filters.assignee !== 'none' &&
      task.assignee?.userId !== filters.assignee
    ) {
      return false;
    }
    if (filters.eventId === 'none' && task.eventId) return false;
    if (filters.eventId && filters.eventId !== 'none' && task.eventId !== filters.eventId) {
      return false;
    }
    if (words.length > 0) {
      const text = `${task.title} ${task.description}`.toLowerCase();
      if (!words.every((word) => text.includes(word))) return false;
    }
    return true;
  });
}

/** Overdue first, then due this week, soonest first: the dashboard's "Tasks due soon". */
export function tasksDueSoon(tasks: readonly Task[], today: string, limit = 5): Task[] {
  const groups = groupTasks(tasks, today);
  return [...groups.overdue, ...groups.thisWeek].slice(0, limit);
}

const dayMonth = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
const weekday = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

/**
 * The date line under a task: "Overdue · 2 Apr 2028", "Due today", "Due Thursday · 12 Apr",
 * "14 Aug 2027", or "Completed 28 Mar". `null` when there's nothing to say.
 */
export function dueLabel(
  task: Task,
  today: string,
  /** The wedding's timezone, for the day a task was completed. */
  timeZone: string,
): { text: string; tone: 'overdue' | 'soon' | 'plain' } | null {
  if (task.status === 'done') {
    if (!task.completedAt) return null;
    const day = todayIn(timeZone, new Date(task.completedAt));
    return { text: `Completed ${dayMonth(day)}`, tone: 'plain' };
  }
  if (!task.dueDate) return null;
  const full = `${dayMonth(task.dueDate)} ${task.dueDate.slice(0, 4)}`;
  if (isOverdue(task, today)) return { text: `Overdue · ${full}`, tone: 'overdue' };
  if (task.dueDate === today) return { text: 'Due today', tone: 'soon' };
  if (task.dueDate === addDays(today, 1)) return { text: 'Due tomorrow', tone: 'soon' };
  if (isDueThisWeek(task, today)) {
    return { text: `Due ${weekday(task.dueDate)} · ${dayMonth(task.dueDate)}`, tone: 'soon' };
  }
  return { text: full, tone: 'plain' };
}

/**
 * "just now", "5 min ago", "2 hours ago", "yesterday", or a date like "12 Oct" (with the year
 * when it isn't this year). Days follow the wedding's timezone.
 */
export function timeAgo(iso: string, timeZone: string, now = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const today = todayIn(timeZone, now);
  const day = todayIn(timeZone, then);
  if (day === today) {
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (day === addDays(today, -1)) return 'yesterday';
  return day.slice(0, 4) === today.slice(0, 4)
    ? dayMonth(day)
    : `${dayMonth(day)} ${day.slice(0, 4)}`;
}
