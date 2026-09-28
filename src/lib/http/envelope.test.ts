import { describe, expect, it } from 'vitest';
import { accepted, created, errorResponse, list, noContent, ok } from './envelope';
import { AppError, ERROR_CODES } from './errors';

describe('success envelope (api-spec §2.3)', () => {
  it('wraps a single item in { data } without meta', async () => {
    const res = ok({ id: '1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: '1' } });
  });

  it('includes meta when given, with the right status codes', async () => {
    expect(await created({ id: '1' }, { possibleDuplicates: [] }).json()).toEqual({
      data: { id: '1' },
      meta: { possibleDuplicates: [] },
    });
    expect(created({}).status).toBe(201);
    expect(accepted({}).status).toBe(202);
  });

  it('lists always carry nextCursor', async () => {
    expect(await list([{ id: '1' }], { nextCursor: null, total: 1 }).json()).toEqual({
      data: [{ id: '1' }],
      meta: { nextCursor: null, total: 1 },
    });
  });

  it('returns 204 with no body', async () => {
    const res = noContent();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});

describe('error envelope (api-spec §2.4)', () => {
  it('uses the code, default message, status and requestId', async () => {
    const res = errorResponse(new AppError('HEADCOUNT_EXCEEDED'), 'req_abc12345');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'HEADCOUNT_EXCEEDED',
        message: ERROR_CODES.HEADCOUNT_EXCEEDED.message,
        requestId: 'req_abc12345',
      },
    });
  });

  it('includes details and extra headers when present', async () => {
    const error = new AppError('RATE_LIMITED', undefined, {
      details: { retryAfterSeconds: 30 },
      headers: { 'Retry-After': '30' },
    });
    const res = errorResponse(error, 'req_1');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect((await res.json()).error.details).toEqual({ retryAfterSeconds: 30 });
  });

  it('maps every documented code to a 4xx or 5xx status', () => {
    for (const { status } of Object.values(ERROR_CODES)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });
});
