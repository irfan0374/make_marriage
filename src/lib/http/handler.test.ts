import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ok } from './envelope';
import { AppError } from './errors';
import { defineHandler } from './handler';

const params = (value: Record<string, string>) => ({ params: Promise.resolve(value) });

function jsonRequest(body: string, contentType = 'application/json') {
  return new NextRequest('http://localhost/api/things', {
    method: 'POST',
    body,
    headers: { 'content-type': contentType },
  });
}

const createThing = defineHandler(
  {
    route: '/api/things',
    body: z.strictObject({ name: z.string().min(1), headcount: z.number().int().min(1) }),
  },
  async ({ body }) => ok(body, undefined, 201),
);

afterEach(() => vi.restoreAllMocks());

describe('defineHandler', () => {
  it('passes parsed input to the handler and sets x-request-id', async () => {
    const res = await createThing(jsonRequest('{"name":"Sharma family","headcount":3}'));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { name: 'Sharma family', headcount: 3 } });
    expect(res.headers.get('x-request-id')).toMatch(/^req_[0-9a-f]{8}$/);
  });

  it('returns VALIDATION_ERROR with field details', async () => {
    const res = await createThing(jsonRequest('{"name":"","headcount":0}'));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'headcount',
      'name',
    ]);
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('rejects unknown fields and $-operators', async () => {
    const res = await createThing(jsonRequest('{"name":"A","headcount":1,"$where":"1"}'));
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid JSON and non-JSON content types', async () => {
    expect((await (await createThing(jsonRequest('{oops'))).json()).error.message).toMatch(
      /valid JSON/,
    );
    const res = await createThing(jsonRequest('name=A', 'application/x-www-form-urlencoded'));
    expect((await res.json()).error.message).toMatch(/Content-Type/);
  });

  it('turns an invalid path id into 404 NOT_FOUND', async () => {
    const getThing = defineHandler(
      { route: '/api/things/[id]', params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }) },
      async ({ params: { id } }) => ok({ id }),
    );
    const request = new NextRequest('http://localhost/api/things/nope');
    const res = await getThing(request, params({ id: 'nope' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('validates the query string when a schema is given', async () => {
    const listThings = defineHandler(
      { route: '/api/things', query: z.strictObject({ limit: z.coerce.number().max(100) }) },
      async ({ query }) => ok(query),
    );
    const good = await listThings(new NextRequest('http://localhost/api/things?limit=20'));
    expect(await good.json()).toEqual({ data: { limit: 20 } });
    const bad = await listThings(new NextRequest('http://localhost/api/things?limit=20&side=x'));
    expect(bad.status).toBe(400);
  });

  it('maps AppError from the service to its status', async () => {
    const handler = defineHandler({ route: '/api/x' }, async () => {
      throw new AppError('WEDDING_ARCHIVED');
    });
    const res = await handler(new NextRequest('http://localhost/api/x'));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('WEDDING_ARCHIVED');
  });

  it('hides unexpected errors behind INTERNAL_ERROR and logs them without secrets', async () => {
    const logged: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => void logged.push(line));
    const handler = defineHandler({ route: '/api/public/invitations/[token]' }, async () => {
      throw new Error('boom');
    });
    const request = new NextRequest('http://localhost/api/public/invitations/SECRETTOKEN123', {
      headers: { cookie: 'mmm_session=SESSIONSECRET' },
    });

    const res = await handler(request);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      requestId: expect.stringMatching(/^req_/),
    });
    expect(body.error.message).not.toContain('boom');
    const entry = JSON.parse(logged.find((line) => line.includes('unhandled_error'))!);
    expect(entry).toMatchObject({
      level: 'error',
      requestId: body.error.requestId,
      route: '/api/public/invitations/[token]',
    });
    expect(entry.err.message).toBe('boom');
    expect(logged.join('\n')).not.toMatch(/SECRETTOKEN123|SESSIONSECRET/);
  });
});
