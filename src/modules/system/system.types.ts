import type { z } from 'zod';
import type { healthSchema } from './system.schemas';

export type Health = z.infer<typeof healthSchema>;
