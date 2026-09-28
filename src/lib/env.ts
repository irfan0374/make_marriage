import 'server-only';
import { z } from 'zod';

// Add each variable here in the phase that first needs it, and to .env.example in the same change.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url({ protocol: /^https?$/ }),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'Must be a mongodb:// or mongodb+srv:// connection string'),
  MONGODB_DB_NAME: z.string().regex(/^[A-Za-z0-9_-]{1,63}$/, 'Must be a valid database name'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(5),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Only names and messages are printed, never values.
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}\nSee .env.example.`);
  }
  return result.data;
}

let cached: Env | undefined;

/**
 * Validated server environment. Parsed lazily so `next build` doesn't need runtime secrets;
 * `src/instrumentation.ts` calls this at server start so a bad config still fails fast.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test-only: forget the cached value after changing process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
