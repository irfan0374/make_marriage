import { describe, expect, it, vi } from 'vitest';
import { incrementWindow } from '@/lib/db/rate-limits';
import { enforceRateLimits, MINUTE } from './rate-limit';

vi.mock('@/lib/db/rate-limits', () => ({ incrementWindow: vi.fn() }));

const now = new Date('2026-09-30T06:05:00Z');
const rule = { key: 'login:email:irfan@example.com', limit: 5, windowMs: 15 * MINUTE };

describe('enforceRateLimits', () => {
  it('allows hits up to the limit', async () => {
    vi.mocked(incrementWindow).mockResolvedValueOnce({ count: 5, resetAt: now.getTime() + 60_000 });
    await expect(enforceRateLimits([rule], now)).resolves.toBeUndefined();
  });

  it('throws RATE_LIMITED with Retry-After once over the limit', async () => {
    vi.mocked(incrementWindow).mockResolvedValueOnce({ count: 6, resetAt: now.getTime() + 90_500 });
    await expect(enforceRateLimits([rule], now)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      headers: { 'Retry-After': '91' },
    });
  });
});
