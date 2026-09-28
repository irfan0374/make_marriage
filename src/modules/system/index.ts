import 'server-only';

export { getHealth } from './system.service';
export { apiNotFoundHandler, getHealthHandler } from './system.handlers';
export type { Health } from './system.types';
