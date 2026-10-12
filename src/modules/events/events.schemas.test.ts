import { describe, expect, it } from 'vitest';
import {
  addPresetEventsSchema,
  createEventSchema,
  deleteEventQuerySchema,
  reorderEventsSchema,
  updateEventSchema,
} from './events.schemas';

const base = { name: 'Mehendi', date: '2028-04-12', startTime: '16:00' };
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe('createEventSchema', () => {
  it('fills defaults for the optional fields', () => {
    expect(createEventSchema.parse(base)).toEqual({
      ...base,
      presetKey: 'custom',
      endTime: null,
      venueName: '',
      address: '',
      mapUrl: null,
      dressCode: '',
      notes: '',
      showOnWebsite: true,
    });
  });

  it('trims text and turns empty end time and map link into null', () => {
    const parsed = createEventSchema.parse({
      ...base,
      name: '  Sangeet  ',
      venueName: ' Grand Hyatt ',
      endTime: '',
      mapUrl: '',
    });
    expect(parsed).toMatchObject({
      name: 'Sangeet',
      venueName: 'Grand Hyatt',
      endTime: null,
      mapUrl: null,
    });
  });

  it('needs a name, date and start time, with clear messages', () => {
    const result = createEventSchema.safeParse({ name: ' ', date: '', startTime: '' });
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        'Enter a name for this event',
        'Choose a date for this event',
        'Choose a start time',
      ]),
    );
  });

  it('rejects bad dates and times', () => {
    expect(createEventSchema.safeParse({ ...base, date: '2028-02-30' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, startTime: '25:00' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, startTime: '4pm' }).success).toBe(false);
  });

  it('allows an end time past midnight but not the same as the start', () => {
    expect(
      createEventSchema.safeParse({ ...base, startTime: '19:00', endTime: '01:30' }).success,
    ).toBe(true);
    const same = createEventSchema.safeParse({ ...base, endTime: '16:00' });
    expect(messages(same)).toEqual(["The end time can't be the same as the start time"]);
  });

  it('only accepts https map links', () => {
    expect(
      createEventSchema.safeParse({ ...base, mapUrl: 'https://maps.google.com/?q=Kochi' }).success,
    ).toBe(true);
    const insecure = createEventSchema.safeParse({ ...base, mapUrl: 'http://maps.google.com' });
    expect(messages(insecure)).toEqual(['Paste a link that starts with https://']);
    expect(createEventSchema.safeParse({ ...base, mapUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    );
  });

  it('caps lengths and rejects unknown fields', () => {
    expect(createEventSchema.safeParse({ ...base, name: 'x'.repeat(61) }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, notes: 'x'.repeat(1001) }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, order: 3 }).success).toBe(false);
  });
});

describe('updateEventSchema', () => {
  it('accepts any subset, and null clears the end time', () => {
    expect(updateEventSchema.parse({ endTime: null })).toEqual({ endTime: null });
    expect(updateEventSchema.parse({ showOnWebsite: false })).toEqual({ showOnWebsite: false });
  });

  it('needs at least one field', () => {
    expect(updateEventSchema.safeParse({}).success).toBe(false);
  });
});

describe('addPresetEventsSchema', () => {
  it('takes presets with a date and start time', () => {
    const input = { events: [{ presetKey: 'mehendi', date: '2028-04-12', startTime: '16:00' }] };
    expect(addPresetEventsSchema.parse(input)).toEqual(input);
  });

  it('rejects custom and empty lists', () => {
    expect(
      addPresetEventsSchema.safeParse({
        events: [{ presetKey: 'custom', date: '2028-04-12', startTime: '16:00' }],
      }).success,
    ).toBe(false);
    expect(addPresetEventsSchema.safeParse({ events: [] }).success).toBe(false);
  });
});

describe('reorderEventsSchema', () => {
  const a = '66f1b0000000000000000001';
  const b = '66f1b0000000000000000002';
  it('takes a list of ids without repeats', () => {
    expect(reorderEventsSchema.safeParse({ eventIds: [a, b] }).success).toBe(true);
    expect(reorderEventsSchema.safeParse({ eventIds: [a, a] }).success).toBe(false);
    expect(reorderEventsSchema.safeParse({ eventIds: ['nope'] }).success).toBe(false);
  });
});

describe('deleteEventQuerySchema', () => {
  it('reads confirm as a boolean', () => {
    expect(deleteEventQuerySchema.parse({})).toEqual({ confirm: false });
    expect(deleteEventQuerySchema.parse({ confirm: 'true' })).toEqual({ confirm: true });
  });
});
