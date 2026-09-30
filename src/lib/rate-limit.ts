import 'server-only';
import { incrementWindow } from '@/lib/db/rate-limits.repository';
import { AppError } from '@/lib/errors';

export interface RateLimitRule {
  /** Counter key, e.g. `login:email:irfan@example.com`. */
  key: string;
  limit: number;
  windowMs: number;
}

/** Count a hit against each rule; throw 429 RATE_LIMITED with Retry-After when any is exceeded. */
export async function enforceRateLimits(rules: RateLimitRule[], now = new Date()): Promise<void> {
  // Independent counters: count them in parallel to save round trips.
  const results = await Promise.all(
    rules.map((rule) => incrementWindow(rule.key, rule.windowMs, now)),
  );
  for (const [index, rule] of rules.entries()) {
    const { count, resetAt } = results[index]!;
    if (count > rule.limit) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));
      throw new AppError('RATE_LIMITED', undefined, {
        headers: { 'Retry-After': String(retryAfter) },
      });
    }
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
