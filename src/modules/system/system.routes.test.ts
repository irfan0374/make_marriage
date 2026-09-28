import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { pingDatabase } from './system.repository';
import { getHealthHandler } from './system.routes';

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
