import { z } from 'zod';

// Client-safe: shared with any UI that shows service status.

export const healthSchema = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['ok', 'down']),
  time: z.iso.datetime(),
});
