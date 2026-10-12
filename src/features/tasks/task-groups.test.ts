import { describe, expect, it } from 'vitest';
import type { Task } from '@/modules/tasks/tasks.types';
import {
  dueLabel,
  timeAgo,
  filterTasks,
  groupTasks,
  hasFilters,
  NO_FILTERS,
  taskStats,
  tasksDueSoon,
} from './task-groups';

const TODAY = '2028-04-10';

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    dueDate: null,
    assignee: null,
    status: 'todo',
    eventId: null,
    completedAt: null,
    createdBy: null,
    source: 'manual',
    starterKey: null,
    priority: 'medium',
    editedBy: null,
    editedAt: '2028-01-01T00:00:00.000Z',
    createdAt: '2028-01-01T00:00:00.000Z',
    ...patch,
  };
}

const tasks = [
  task('overdue', { dueDate: '2028-04-08' }),
  task('today', { dueDate: TODAY, assignee: { userId: 'u1', name: 'Riya' } }),
  task('sunday', { dueDate: '2028-04-16', eventId: 'e1' }),
  task('nextWeek', { dueDate: '2028-04-17' }),
  task('undated', { description: 'Call the florist' }),
  task('done', { status: 'done', dueDate: '2028-04-01', completedAt: '2028-04-02T00:00:00.000Z' }),
];

describe('groupTasks', () => {
  it('splits into overdue, this week (7 days), later and done', () => {
    const groups = groupTasks(tasks, TODAY);
    expect(groups.overdue.map((t) => t.id)).toEqual(['overdue']);
    expect(groups.thisWeek.map((t) => t.id)).toEqual(['today', 'sunday']);
    expect(groups.later.map((t) => t.id)).toEqual(['nextWeek', 'undated']);
    // A done task is never overdue.
    expect(groups.done.map((t) => t.id)).toEqual(['done']);
  });

  it('counts the stat cards', () => {
    expect(taskStats(tasks, TODAY)).toEqual({
      open: 5,
      overdue: 1,
      dueThisWeek: 2,
      done: 1,
      total: 6,
    });
  });

  it('picks tasks due soon for the dashboard', () => {
    expect(tasksDueSoon(tasks, TODAY).map((t) => t.id)).toEqual(['overdue', 'today', 'sunday']);
  });
});

describe('filterTasks', () => {
  const ctx = { today: TODAY, myUserId: 'u1' };
  const ids = (filters: Partial<typeof NO_FILTERS>) =>
    filterTasks(tasks, { ...NO_FILTERS, ...filters }, ctx).map((t) => t.id);

  it('filters by view, assignee, event and words', () => {
    expect(ids({ view: 'mine' })).toEqual(['today']);
    expect(ids({ view: 'overdue' })).toEqual(['overdue']);
    expect(ids({ assignee: 'none' })).toHaveLength(5);
    expect(ids({ eventId: 'e1' })).toEqual(['sunday']);
    expect(ids({ eventId: 'none' })).toHaveLength(5);
    expect(ids({ search: 'FLORIST call' })).toEqual(['undated']);
  });

  it('knows when filters are on', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, search: ' ' })).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, eventId: 'e1' })).toBe(true);
  });
});

describe('dueLabel', () => {
  it('reads like the Stitch rows', () => {
    const label = (patch: Partial<Task>) =>
      dueLabel(task('x', patch), TODAY, 'Asia/Kolkata')?.text ?? null;
    expect(label({ dueDate: '2028-04-02' })).toBe('Overdue · 2 Apr 2028');
    expect(label({ dueDate: TODAY })).toBe('Due today');
    expect(label({ dueDate: '2028-04-11' })).toBe('Due tomorrow');
    expect(label({ dueDate: '2028-04-13' })).toBe('Due Thursday · 13 Apr');
    expect(label({ dueDate: '2028-08-14' })).toBe('14 Aug 2028');
    expect(label({})).toBeNull();
    expect(label({ status: 'done', completedAt: '2028-03-28T10:00:00.000Z' })).toBe(
      'Completed 28 Mar',
    );
  });
});

describe('status and due-date filters', () => {
  it('combines status with due date and clears both', () => {
    const input = [...tasks, task('working', { status: 'in_progress', dueDate: TODAY })];
    expect(
      filterTasks(
        input,
        { ...NO_FILTERS, status: 'in_progress', due: 'this_week' },
        { today: TODAY, myUserId: 'u1' },
      ).map((t) => t.id),
    ).toEqual(['working']);
    expect(
      filterTasks(input, { ...NO_FILTERS, due: 'none' }, { today: TODAY, myUserId: 'u1' }).map(
        (t) => t.id,
      ),
    ).toEqual(['undated']);
    expect(hasFilters({ ...NO_FILTERS, status: 'done' })).toBe(true);
    expect(hasFilters({ ...NO_FILTERS, due: 'this_week' })).toBe(true);
    expect(filterTasks(input, NO_FILTERS, { today: TODAY, myUserId: 'u1' })).toHaveLength(
      input.length,
    );
  });
});

describe('priority', () => {
  it('puts High first inside a group, then by due date', () => {
    const list = [
      task('lowSoon', { dueDate: '2028-04-11', priority: 'low' }),
      task('highLater', { dueDate: '2028-04-15', priority: 'high' }),
      task('mediumSoon', { dueDate: '2028-04-11' }),
    ];
    expect(groupTasks(list, TODAY).thisWeek.map((t) => t.id)).toEqual([
      'highLater',
      'mediumSoon',
      'lowSoon',
    ]);
  });

  it('filters by priority', () => {
    const list = [task('a', { priority: 'high' }), task('b')];
    const ids = filterTasks(
      list,
      { ...NO_FILTERS, priority: 'high' },
      { today: TODAY, myUserId: undefined },
    );
    expect(ids.map((t) => t.id)).toEqual(['a']);
    expect(hasFilters({ ...NO_FILTERS, priority: 'low' })).toBe(true);
  });
});

describe('timeAgo', () => {
  const now = new Date('2028-04-10T12:00:00.000Z'); // 5:30 PM in India
  const ago = (iso: string) => timeAgo(iso, 'Asia/Kolkata', now);
  it('reads naturally', () => {
    expect(ago('2028-04-10T11:59:40.000Z')).toBe('just now');
    expect(ago('2028-04-10T11:55:00.000Z')).toBe('5 min ago');
    expect(ago('2028-04-10T10:00:00.000Z')).toBe('2 hours ago');
    expect(ago('2028-04-09T10:00:00.000Z')).toBe('yesterday');
    expect(ago('2028-03-28T10:00:00.000Z')).toBe('28 Mar');
    expect(ago('2027-12-28T10:00:00.000Z')).toBe('28 Dec 2027');
  });
});
