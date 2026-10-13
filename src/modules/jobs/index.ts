import 'server-only';

// Public API of the jobs module: the background queue (architecture §9.2–9.3).
export { jobsCollectionSpecs } from './jobs.indexes';
export {
  cancelBatchJobs,
  DeferJobError,
  enqueueJobs,
  familiesWithPendingJobs,
  getBatch,
  listRecentBatches,
  PermanentJobError,
  processJobs,
  type JobHandler,
  type JobHandlers,
  type JobRunTools,
} from './jobs.service';
export type { BatchCounts, JobDocument, ProcessJobsResult } from './jobs.types';
