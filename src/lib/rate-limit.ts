import 'server-only';
import { incrementWindow, readWindow } from '@/lib/db/rate-limits.repository';
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
export const DAY = 24 * HOUR;

/**
 * Use one unit of a quota, e.g. the daily email limit. Unlike `enforceRateLimits` it never
 * throws: it says whether there was room, and when the window resets.
 */
export async function takeQuota(
  key: string,
  limit: number,
  windowMs: number,
  now = new Date(),
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const { count, resetAt } = await incrementWindow(key, windowMs, now);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(resetAt),
  };
}

/** How much of a quota is left, without using any. */
export async function quotaLeft(
  key: string,
  limit: number,
  windowMs: number,
  now = new Date(),
): Promise<{ remaining: number; resetAt: Date }> {
  const { count, resetAt } = await readWindow(key, windowMs, now);
  return { remaining: Math.max(0, limit - count), resetAt: new Date(resetAt) };
}
