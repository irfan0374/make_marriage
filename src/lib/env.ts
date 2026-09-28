import 'server-only';
import { z } from 'zod';

// Every variable the app will ever need, listed in .env.example grouped by service.
// Required: only what the app needs today (app + database). Future services are optional and
// become required when their feature is built; until then code reads them with `requireEnv`.

/** Optional variable: unset and empty (`KEY=` copied from .env.example) both mean "not configured". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z.object({
  // --- App (required) ---
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url({ protocol: /^https?$/ }),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // --- MongoDB Atlas (required) ---
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'Must be a mongodb:// or mongodb+srv:// connection string'),
  MONGODB_DB_NAME: z.string().regex(/^[A-Za-z0-9_-]{1,63}$/, 'Must be a valid database name'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(5),

  // --- Resend email: becomes required in Phase 1 (password reset, member invites, invitations) ---
  RESEND_API_KEY: optional(z.string().min(1)),
  RESEND_WEBHOOK_SECRET: optional(z.string().min(1)),
  EMAIL_FROM: optional(
    z
      .string()
      .regex(
        /^(.+<[^<>\s@]+@[^<>\s@]+>|[^<>\s@]+@[^<>\s@]+)$/,
        'Must be "Name <email>" or an email',
      ),
  ),
  EMAIL_DAILY_LIMIT: z.coerce.number().int().min(1).default(100),

  // --- Cloudflare R2: becomes required in Phase 1 (invitation media), used by receipts and gallery ---
  R2_ACCOUNT_ID: optional(z.string().min(1)),
  R2_ACCESS_KEY_ID: optional(z.string().min(1)),
  R2_SECRET_ACCESS_KEY: optional(z.string().min(1)),
  R2_BUCKET: optional(
    z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Must be a valid bucket name'),
  ),

  // --- Cron: becomes required in Phase 1 (bulk email queue via /api/cron/*) ---
  CRON_SECRET: optional(z.string().min(32, 'Must be at least 32 characters')),

  // --- Google Places: becomes required at the end of Phase 4 (location and vendor search) ---
  GOOGLE_PLACES_API_KEY: optional(z.string().min(1)),
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

type OptionalKey = { [K in keyof Env]-?: undefined extends Env[K] ? K : never }[keyof Env];

/**
 * Read optional variables a feature can't run without, e.g. `requireEnv('RESEND_API_KEY', 'EMAIL_FROM')`.
 * Throws a clear error naming what's missing (never values) at the point of use.
 */
export function requireEnv<K extends OptionalKey>(
  ...names: K[]
): { [P in K]: NonNullable<Env[P]> } {
  const env = getEnv();
  const missing = names.filter((name) => env[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required for this feature but not set. See .env.example.`,
    );
  }
  return Object.fromEntries(names.map((name) => [name, env[name]])) as {
    [P in K]: NonNullable<Env[P]>;
  };
}
