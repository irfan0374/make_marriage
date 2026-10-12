import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import {
  addPresetEventsHandler,
  createEventHandler,
  listEventsHandler,
  reorderEventsHandler,
  updateEventHandler,
} from './events.handlers';
import * as service from './events.service';

// The event routes stay thin: they check the request and pass it on. Permissions, limits and
// tenant isolation are tested end to end in tests/integration/events.test.ts.

vi.mock('./events.service', () => ({
  addPresetEvents: vi.fn(),
  createEvent: vi.fn(),
  listEvents: vi.fn(),
  reorderEvents: vi.fn(),
  updateEvent: vi.fn(),
}));

const weddingId = '66f1b0000000000000000001';
const eventId = '66f1b0000000000000000002';
const otherId = '66f1b0000000000000000003';
const cookie = 'mmm_session=raw-token';
const base = `/api/weddings/${weddingId}/events`;

function request(method: string, path: string, body?: unknown, origin = 'http://localhost') {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin, cookie },
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const mehendi = { name: 'Mehendi', date: '2028-04-12', startTime: '16:00' };

beforeEach(() => vi.clearAllMocks());

describe('GET events', () => {
  it('lists events, and 404s a malformed wedding id', async () => {
    vi.mocked(service.listEvents).mockResolvedValueOnce([]);
    const ok = await listEventsHandler(request('GET', base), params({ weddingId }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ data: [] });
    const bad = await listEventsHandler(
      request('GET', '/api/weddings/nope/events'),
      params({ weddingId: 'nope' }),
    );
    expect(bad.status).toBe(404);
    expect(service.listEvents).toHaveBeenCalledTimes(1);
  });
});

describe('POST events', () => {
  const create = (body: unknown, origin?: string) =>
    createEventHandler(request('POST', base, body, origin), params({ weddingId }));

  it('fills in the defaults and returns 201', async () => {
    vi.mocked(service.createEvent).mockResolvedValueOnce({ id: eventId } as never);
    const res = await create({ ...mehendi, name: '  Mehendi ', endTime: '', mapUrl: '' });
    expect(res.status).toBe(201);
    expect(vi.mocked(service.createEvent).mock.calls[0]![2]).toEqual({
      name: 'Mehendi',
      presetKey: 'custom',
      date: '2028-04-12',
      startTime: '16:00',
      endTime: null,
      venueName: '',
      address: '',
      mapUrl: null,
      dressCode: '',
      notes: '',
      showOnWebsite: true,
    });
  });

  it('refuses missing fields, a non-https map link and the same start and end time', async () => {
    for (const body of [
      { name: 'Mehendi' },
      { ...mehendi, mapUrl: 'javascript:alert(1)' },
      { ...mehendi, mapUrl: 'http://maps.example.com' },
      { ...mehendi, endTime: '16:00' },
      { ...mehendi, unknown: true },
    ]) {
      const res = await create(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    }
    expect(service.createEvent).not.toHaveBeenCalled();
  });

  it('rejects requests from another site', async () => {
    expect((await create(mehendi, 'https://evil.example')).status).toBe(403);
    expect(service.createEvent).not.toHaveBeenCalled();
  });

  it('passes through the event limit', async () => {
    vi.mocked(service.createEvent).mockRejectedValueOnce(new AppError('EVENT_LIMIT_REACHED'));
    const res = await create(mehendi);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('EVENT_LIMIT_REACHED');
  });
});

describe('POST events/presets', () => {
  const presets = (body: unknown) =>
    addPresetEventsHandler(request('POST', `${base}/presets`, body), params({ weddingId }));

  it('passes the chosen presets on', async () => {
    vi.mocked(service.addPresetEvents).mockResolvedValueOnce([]);
    const events = [{ presetKey: 'haldi', date: '2028-04-13', startTime: '09:30' }];
    expect((await presets({ events })).status).toBe(201);
    expect(vi.mocked(service.addPresetEvents).mock.calls[0]![2]).toEqual({ events });
  });

  it('refuses an empty list and unknown presets', async () => {
    expect((await presets({ events: [] })).status).toBe(400);
    expect(
      (
        await presets({
          events: [{ presetKey: 'custom', date: '2028-04-13', startTime: '09:30' }],
        })
      ).status,
    ).toBe(400);
    expect(service.addPresetEvents).not.toHaveBeenCalled();
  });
});

describe('PATCH events/{eventId}', () => {
  const patch = (body: unknown, id = eventId) =>
    updateEventHandler(request('PATCH', `${base}/${id}`, body), params({ weddingId, eventId: id }));

  it('returns the event with the change meta', async () => {
    const meta = { guestFacingChange: false, affectedHouseholds: 0 };
    vi.mocked(service.updateEvent).mockResolvedValueOnce({
      event: { id: eventId } as never,
      meta,
    });
    const res = await patch({ venueName: 'Bolgatty Palace', endTime: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: eventId }, meta });
    expect(vi.mocked(service.updateEvent).mock.calls[0]![3]).toEqual({
      venueName: 'Bolgatty Palace',
      endTime: null,
    });
  });

  it('refuses an empty change and a malformed event id', async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ name: 'X' }, 'nope')).status).toBe(404);
    expect(service.updateEvent).not.toHaveBeenCalled();
  });
});

describe('POST events/reorder', () => {
  const reorder = (body: unknown) =>
    reorderEventsHandler(request('POST', `${base}/reorder`, body), params({ weddingId }));

  it('passes the ids on in order', async () => {
    vi.mocked(service.reorderEvents).mockResolvedValueOnce([]);
    expect((await reorder({ eventIds: [otherId, eventId] })).status).toBe(200);
    const ids = vi.mocked(service.reorderEvents).mock.calls[0]![2];
    expect(ids.map((id) => id.toHexString())).toEqual([otherId, eventId]);
  });

  it('refuses duplicates (in any letter case), malformed ids and an empty list', async () => {
    for (const eventIds of [[eventId, eventId.toUpperCase()], ['nope'], []]) {
      expect((await reorder({ eventIds })).status).toBe(400);
    }
    expect(service.reorderEvents).not.toHaveBeenCalled();
  });
});
