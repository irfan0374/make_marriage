import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health (Atlas test database)', () => {
  it('reports the database as reachable', async () => {
    const res = await GET(new NextRequest('http://localhost/api/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { status: 'ok', db: 'ok', time: expect.any(String) },
    });
  });
});
