import 'server-only';

export { getHealth } from './system.service';
export { apiNotFoundHandler, getHealthHandler } from './system.routes';
export type { Health } from './system.types';
