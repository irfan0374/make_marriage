'use client';

import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addStarterTasks,
  createTask,
  deleteTask,
  getStarterChecklist,
  getTasks,
  updateTask,
} from '@/features/tasks/api';
import type {
  AddStarterTasksInput,
  CreateTaskInput,
  Task,
  UpdateTaskInput,
} from '@/modules/tasks/tasks.types';

export const tasksKey = (weddingId: string) => ['weddings', weddingId, 'tasks'] as const;
const starterKey = (weddingId: string) => ['weddings', weddingId, 'tasks', 'starter'] as const;

export function useTasks(weddingId: string) {
  return useQuery({ queryKey: tasksKey(weddingId), queryFn: () => getTasks(weddingId) });
}

export function useStarterChecklist(weddingId: string) {
  return useQuery({
    queryKey: starterKey(weddingId),
    queryFn: () => getStarterChecklist(weddingId),
  });
}

/** Any change: reload the list (and with it the starter checklist's "Already added"). */
function useRefreshTasks(weddingId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tasksKey(weddingId) });
}

export function useCreateTask(weddingId: string) {
  const onSettled = useRefreshTasks(weddingId);
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(weddingId, input),
    onSettled,
  });
}

/**
 * Save a change. A status change from the list (checkbox or pill) shows at once and rolls back
 * if saving fails, so ticking things off feels instant.
 */
export function usePendingTaskIds(weddingId: string) {
  return useMutationState({
    filters: { mutationKey: [...tasksKey(weddingId), 'update'], status: 'pending' },
    select: (mutation) => (mutation.state.variables as { taskId: string }).taskId,
  });
}

export function useUpdateTask(weddingId: string) {
  const queryClient = useQueryClient();
  const key = tasksKey(weddingId);
  return useMutation({
    mutationKey: [...key, 'update'],
    // Queued saves preserve click order across list and panel instances.
    scope: { id: `task-updates-${weddingId}` },
    mutationFn: ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) =>
      updateTask(weddingId, taskId, input),
    onMutate: async ({ taskId, input }) => {
      if (input.status === undefined || Object.keys(input).length !== 1) return {};
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key)?.find((task) => task.id === taskId);
      queryClient.setQueryData<Task[]>(key, (tasks) =>
        tasks?.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: input.status!,
                completedAt: input.status === 'done' ? new Date().toISOString() : null,
              }
            : task,
        ),
      );
      return { previous };
    },
    onError: (_error, vars, context) => {
      if (context?.previous)
        queryClient.setQueryData<Task[]>(key, (tasks) =>
          tasks?.map((task) => (task.id === vars.taskId ? context.previous! : task)),
        );
    },
    // A completed request must not refetch over another task's optimistic change.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: [...key, 'update'] }) === 1) {
        return queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useDeleteTask(weddingId: string) {
  const onSettled = useRefreshTasks(weddingId);
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(weddingId, taskId),
    onSettled,
  });
}

export function useAddStarterTasks(weddingId: string) {
  const onSettled = useRefreshTasks(weddingId);
  return useMutation({
    mutationFn: (input: AddStarterTasksInput) => addStarterTasks(weddingId, input),
    onSettled,
  });
}
