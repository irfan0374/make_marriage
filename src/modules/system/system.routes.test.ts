import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { pingDatabase } from './system.repository';
import { apiNotFoundHandler, getHealthHandler } from './system.routes';

vi.mock('./system.repository', () => ({ pingDatabase: vi.fn() }));

const request = () => new NextRequest('http://localhost/api/health');

describe('GET /api/health', () => {
  it('returns 200 ok when the database answers', async () => {
    vi.mocked(pingDatabase).mockResolvedValueOnce();
    const res = await getHealthHandler(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { status: 'ok', db: 'ok', time: expect.any(String) },
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(pingDatabase).mockRejectedValueOnce(new Error('Server selection timed out'));
    const res = await getHealthHandler(request());
    expect(res.status).toBe(503);
    expect((await res.json()).data).toMatchObject({ status: 'error', db: 'down' });
  });
});

describe('unknown /api paths', () => {
  it('return NOT_FOUND in the JSON envelope for any method', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const res = await apiNotFoundHandler(
        new NextRequest('http://localhost/api/does-not-exist', { method }),
      );
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect((await res.json()).error).toMatchObject({
        code: 'NOT_FOUND',
        requestId: expect.stringMatching(/^req_/),
      });
    }
  });
});
