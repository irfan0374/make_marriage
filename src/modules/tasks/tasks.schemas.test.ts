import { describe, expect, it } from 'vitest';
import {
  addStarterTasksSchema,
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from './tasks.schemas';

const id = '66F1B0000000000000000001';

describe('createTaskSchema', () => {
  it('needs only a title and fills the rest', () => {
    expect(createTaskSchema.parse({ title: '  Book the venue ' })).toEqual({
      title: 'Book the venue',
      description: '',
      dueDate: null,
      assigneeUserId: null,
      eventId: null,
      status: 'todo',
      priority: 'medium',
    });
  });

  it('treats empty choices as none and lowercases ids', () => {
    expect(
      createTaskSchema.parse({ title: 'X', dueDate: '', assigneeUserId: '', eventId: id }),
    ).toMatchObject({ dueDate: null, assigneeUserId: null, eventId: id.toLowerCase() });
  });

  it('rejects a blank or long title, bad dates and unknown fields', () => {
    const blank = createTaskSchema.safeParse({ title: '  ' });
    expect(blank.error?.issues[0]?.message).toBe('Enter what needs doing');
    expect(createTaskSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'X', dueDate: '2028-02-30' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'X', status: 'maybe' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'X', priority: 'urgent' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'X', completedAt: 'now' }).success).toBe(false);
  });
});

describe('updateTaskSchema', () => {
  it('takes any subset, with null clearing a field', () => {
    expect(updateTaskSchema.parse({ assigneeUserId: null })).toEqual({ assigneeUserId: null });
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });
});

describe('listTasksQuerySchema', () => {
  it('reads filters and defaults', () => {
    expect(listTasksQuerySchema.parse({})).toEqual({ sort: 'dueDate', limit: 100 });
    expect(
      listTasksQuerySchema.parse({ status: 'todo,in_progress', assignee: 'me', limit: '20' }),
    ).toMatchObject({ status: ['todo', 'in_progress'], assignee: 'me', limit: 20 });
  });

  it('rejects unknown values', () => {
    expect(listTasksQuerySchema.safeParse({ status: 'todo,later' }).success).toBe(false);
    expect(listTasksQuerySchema.safeParse({ assignee: 'everyone' }).success).toBe(false);
    expect(listTasksQuerySchema.safeParse({ cursor: 'abc' }).success).toBe(false);
    expect(listTasksQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});

describe('addStarterTasksSchema', () => {
  it('takes known keys once each', () => {
    expect(addStarterTasksSchema.safeParse({ keys: ['book_venue'] }).success).toBe(true);
    expect(addStarterTasksSchema.safeParse({ keys: [] }).success).toBe(false);
    expect(addStarterTasksSchema.safeParse({ keys: ['book_venue', 'book_venue'] }).success).toBe(
      false,
    );
    expect(addStarterTasksSchema.safeParse({ keys: ['book_yacht'] }).success).toBe(false);
  });
});
