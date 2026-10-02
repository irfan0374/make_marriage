import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import {
  createWeddingHandler,
  getMeHandler,
  getWeddingHandler,
  updateWeddingHandler,
} from './weddings.handlers';
import * as service from './weddings.service';
import { todayIn } from '@/shared/dates';

// Two years ahead: always in the future and within the 5-year limit (api-spec §6.1).
const YEAR = Number(todayIn('Asia/Kolkata').slice(0, 4)) + 2;

vi.mock('./weddings.service', () => ({
  createWedding: vi.fn(),
  getWedding: vi.fn(),
  getMe: vi.fn(),
  updateWedding: vi.fn(),
}));

const weddingId = '66f1b0000000000000000001';
const wedding = { id: weddingId, brideName: 'Nafiya', groomName: 'Irfan' };
const cookie = 'mmm_session=raw-token';

function post(body: unknown, origin = 'http://localhost') {
  return new NextRequest('http://localhost/api/weddings', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin, cookie },
  });
}

const getWedding = (id: string) =>
  getWeddingHandler(
    new NextRequest(`http://localhost/api/weddings/${id}`, { headers: { cookie } }),
    {
      params: Promise.resolve({ weddingId: id }),
    },
  );

beforeEach(() => vi.clearAllMocks());

describe('POST /api/weddings', () => {
  const input = {
    brideName: 'Nafiya',
    groomName: 'Irfan',
    weddingDate: `${YEAR}-04-14`,
    city: 'Kochi',
    sidesEnabled: true,
  };

  it('creates the wedding and returns 201', async () => {
    vi.mocked(service.createWedding).mockResolvedValueOnce(wedding as never);
    const res = await createWeddingHandler(post(input));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: wedding });
    expect(service.createWedding).toHaveBeenCalledWith('raw-token', {
      ...input,
      venue: '',
      timezone: 'Asia/Kolkata',
    });
  });

  it('returns field errors for invalid input without calling the service', async () => {
    const res = await createWeddingHandler(post({ ...input, city: '', weddingDate: '2000-01-01' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'city',
      'weddingDate',
    ]);
    expect(service.createWedding).not.toHaveBeenCalled();
  });

  it('rejects requests from another site', async () => {
    const res = await createWeddingHandler(post(input, 'https://evil.example'));
    expect(res.status).toBe(403);
    expect(service.createWedding).not.toHaveBeenCalled();
  });
});

describe('GET /api/weddings/{weddingId}', () => {
  it('returns the wedding for a member', async () => {
    vi.mocked(service.getWedding).mockResolvedValueOnce(wedding as never);
    const res = await getWedding(weddingId);
    expect(res.status).toBe(200);
    expect(vi.mocked(service.getWedding).mock.calls[0]![1].toHexString()).toBe(weddingId);
  });

  it('returns 404 for a malformed id without calling the service', async () => {
    const res = await getWedding('not-an-id');
    expect(res.status).toBe(404);
    expect(service.getWedding).not.toHaveBeenCalled();
  });

  it('passes through 404 for a non-member', async () => {
    vi.mocked(service.getWedding).mockRejectedValueOnce(new AppError('NOT_FOUND'));
    const res = await getWedding(weddingId);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/me', () => {
  it('returns 401 without a session', async () => {
    vi.mocked(service.getMe).mockRejectedValueOnce(new AppError('UNAUTHENTICATED'));
    const res = await getMeHandler(new NextRequest('http://localhost/api/me'));
    expect(res.status).toBe(401);
  });

  it('returns the user and their weddings', async () => {
    const me = { user: { id: 'u1', email: 'irfan@example.com', name: 'Irfan' }, weddings: [] };
    vi.mocked(service.getMe).mockResolvedValueOnce(me);
    const res = await getMeHandler(
      new NextRequest('http://localhost/api/me', { headers: { cookie } }),
    );
    expect(await res.json()).toEqual({ data: me });
    expect(service.getMe).toHaveBeenCalledWith('raw-token');
  });
});

describe('PATCH /api/weddings/{weddingId}', () => {
  const patch = (body: unknown, origin = 'http://localhost') =>
    updateWeddingHandler(
      new NextRequest(`http://localhost/api/weddings/${weddingId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', origin, cookie },
      }),
      { params: Promise.resolve({ weddingId }) },
    );

  it('passes the parsed changes to the service', async () => {
    vi.mocked(service.updateWedding).mockResolvedValueOnce(wedding as never);
    const res = await patch({ city: ' Thrissur ', timezone: 'Asia/Dubai' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: wedding });
    const [token, id, input] = vi.mocked(service.updateWedding).mock.calls[0]!;
    expect(token).toBe('raw-token');
    expect(id.toHexString()).toBe(weddingId);
    expect(input).toEqual({ city: 'Thrissur', timezone: 'Asia/Dubai' });
  });

  it('rejects invalid and unknown fields without calling the service', async () => {
    const res = await patch({ city: '', guestTags: [] });
    expect(res.status).toBe(400);
    expect(service.updateWedding).not.toHaveBeenCalled();
  });

  it('passes through 403 for a Manager and 409 for an archived wedding', async () => {
    vi.mocked(service.updateWedding).mockRejectedValueOnce(new AppError('FORBIDDEN'));
    expect((await patch({ city: 'Thrissur' })).status).toBe(403);
    vi.mocked(service.updateWedding).mockRejectedValueOnce(new AppError('WEDDING_ARCHIVED'));
    const res = await patch({ city: 'Thrissur' });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('WEDDING_ARCHIVED');
  });

  it('rejects requests from another site', async () => {
    expect((await patch({ city: 'Thrissur' }, 'https://evil.example')).status).toBe(403);
    expect(service.updateWedding).not.toHaveBeenCalled();
  });
});
