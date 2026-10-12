import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { deleteEventHandler } from './cleanup.handlers';
import * as service from './cleanup.service';

// The delete-event route stays thin; the cleanup itself is tested end to end in
// tests/integration/events.test.ts and tasks.test.ts.

vi.mock('./cleanup.service', () => ({ deleteEvent: vi.fn() }));

const weddingId = '66f1b0000000000000000001';
const eventId = '66f1b0000000000000000002';
const cookie = 'mmm_session=raw-token';
const base = `/api/weddings/${weddingId}/events`;

function request(method: string, path: string) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

beforeEach(() => vi.clearAllMocks());

describe('DELETE events/{eventId}', () => {
  const remove = (query = '') =>
    deleteEventHandler(
      request('DELETE', `${base}/${eventId}${query}`),
      params({ weddingId, eventId }),
    );

  it('reads ?confirm=true, defaulting to false', async () => {
    expect((await remove()).status).toBe(204);
    expect((await remove('?confirm=true')).status).toBe(204);
    expect(vi.mocked(service.deleteEvent).mock.calls.map((call) => call[3])).toEqual([false, true]);
  });

  it('refuses other query values', async () => {
    expect((await remove('?confirm=yes')).status).toBe(400);
    expect((await remove('?force=true')).status).toBe(400);
    expect(service.deleteEvent).not.toHaveBeenCalled();
  });

  it('passes through the confirmation request', async () => {
    vi.mocked(service.deleteEvent).mockRejectedValueOnce(
      new AppError('CONFIRMATION_REQUIRED', undefined, { details: { affectedHouseholds: 3 } }),
    );
    const res = await remove();
    expect(res.status).toBe(409);
    expect((await res.json()).error.details).toEqual({ affectedHouseholds: 3 });
  });
});
