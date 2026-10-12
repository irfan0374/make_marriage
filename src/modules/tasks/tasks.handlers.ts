import 'server-only';
import { z } from 'zod';
import { created, defineHandler, list, noContent, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import {
  addStarterTasksSchema,
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from './tasks.schemas';
import {
  addStarterTasks,
  createTask,
  deleteTask,
  getStarterChecklist,
  listTasks,
  updateTask,
} from './tasks.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });
const taskParams = z.strictObject({ weddingId: objectIdString, taskId: objectIdString });

// GET /api/weddings/{weddingId}/tasks (api-spec §12.1)
export const listTasksHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/tasks', params: weddingParams, query: listTasksQuerySchema },
  async ({ request, params, query }) => {
    const { tasks, nextCursor } = await listTasks(
      readSessionToken(request),
      toObjectId(params.weddingId),
      query,
    );
    return list(tasks, { nextCursor });
  },
);

// POST /api/weddings/{weddingId}/tasks (api-spec §12.2)
export const createTaskHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/tasks', params: weddingParams, body: createTaskSchema },
  async ({ request, params, body }) =>
    created(await createTask(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// PATCH /api/weddings/{weddingId}/tasks/{taskId} (api-spec §12.3)
export const updateTaskHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/tasks/[taskId]', params: taskParams, body: updateTaskSchema },
  async ({ request, params, body }) =>
    ok(
      await updateTask(
        readSessionToken(request),
        toObjectId(params.weddingId),
        toObjectId(params.taskId),
        body,
      ),
    ),
);

// DELETE /api/weddings/{weddingId}/tasks/{taskId} (api-spec §12.4)
export const deleteTaskHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/tasks/[taskId]', params: taskParams },
  async ({ request, params }) => {
    await deleteTask(
      readSessionToken(request),
      toObjectId(params.weddingId),
      toObjectId(params.taskId),
    );
    return noContent();
  },
);

// GET /api/weddings/{weddingId}/tasks/starter-checklist (api-spec §12.5)
export const getStarterChecklistHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/tasks/starter-checklist', params: weddingParams },
  async ({ request, params }) =>
    ok(await getStarterChecklist(readSessionToken(request), toObjectId(params.weddingId))),
);

// POST /api/weddings/{weddingId}/tasks/starter-checklist (api-spec §12.6)
export const addStarterTasksHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/tasks/starter-checklist',
    params: weddingParams,
    body: addStarterTasksSchema,
  },
  async ({ request, params, body }) =>
    created(await addStarterTasks(readSessionToken(request), toObjectId(params.weddingId), body)),
);
