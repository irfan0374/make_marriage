import type {
  AddStarterTasksInput,
  CreateTaskInput,
  StarterTask,
  Task,
  UpdateTaskInput,
} from '@/modules/tasks/tasks.types';
import { apiFetch, apiFetchAll, postJson } from '@/shared/api-client';

const base = (weddingId: string) => `/api/weddings/${weddingId}/tasks`;

export const getTasks = (weddingId: string) => apiFetchAll<Task>(base(weddingId));
export const createTask = (weddingId: string, input: CreateTaskInput) =>
  postJson<Task>(base(weddingId), input);
export const updateTask = (weddingId: string, taskId: string, input: UpdateTaskInput) =>
  apiFetch<Task>(`${base(weddingId)}/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const deleteTask = (weddingId: string, taskId: string) =>
  apiFetch<void>(`${base(weddingId)}/${taskId}`, { method: 'DELETE' });
export const getStarterChecklist = (weddingId: string) =>
  apiFetch<StarterTask[]>(`${base(weddingId)}/starter-checklist`);
export const addStarterTasks = (weddingId: string, input: AddStarterTasksInput) =>
  postJson<Task[]>(`${base(weddingId)}/starter-checklist`, input);
