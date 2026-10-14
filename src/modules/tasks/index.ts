import 'server-only';

// Public API of the tasks module (api-spec §12).
export {
  addStarterTasksHandler,
  createTaskHandler,
  deleteTaskHandler,
  getStarterChecklistHandler,
  listTasksHandler,
  updateTaskHandler,
} from './tasks.handlers';
export { tasksCollectionSpecs } from './tasks.indexes';
export {
  queueTaskReminders,
  taskJobHandlers,
  unassignTasksOf,
  unlinkEventFromTasks,
} from './tasks.service';
export type { StarterTask, Task } from './tasks.types';
