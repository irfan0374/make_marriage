import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWeddingSchema } from './weddings.schemas';

const valid = {
  brideName: ' Nafiya ',
  groomName: 'Irfan',
  weddingDate: '2028-04-14',
  city: 'Kochi',
};

beforeEach(() => {
  vi.useFakeTimers();
  // 1 Oct 2026, 11:30 in India.
  vi.setSystemTime(new Date('2026-10-01T06:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const errors = (input: unknown) =>
  createWeddingSchema.safeParse(input).error?.issues.map((i) => [i.path.join('.'), i.message]);

describe('createWeddingSchema', () => {
  it('trims names and defaults the optional fields', () => {
    expect(createWeddingSchema.parse(valid)).toEqual({
      brideName: 'Nafiya',
      groomName: 'Irfan',
      weddingDate: '2028-04-14',
      city: 'Kochi',
      venue: '',
      timezone: 'Asia/Kolkata',
      sidesEnabled: false,
    });
  });

  it('keeps a venue and a chosen timezone', () => {
    const parsed = createWeddingSchema.parse({
      ...valid,
      venue: '  Grand Hyatt, Bolgatty Island ',
      timezone: 'Asia/Dubai',
    });
    expect(parsed).toMatchObject({ venue: 'Grand Hyatt, Bolgatty Island', timezone: 'Asia/Dubai' });
  });

  it('rejects unknown timezones and over-long venues', () => {
    expect(errors({ ...valid, timezone: 'Mars/Olympus' })).toEqual([
      ['timezone', 'Choose a valid timezone'],
    ]);
    expect(errors({ ...valid, venue: 'x'.repeat(201) })).toEqual([
      ['venue', 'Use at most 200 characters'],
    ]);
  });

  it('checks "today" in the chosen timezone', () => {
    // 03:00 UTC on 1 Oct: 08:30 on 1 Oct in India, still 23:00 on 30 Sep in New York.
    vi.setSystemTime(new Date('2026-10-01T03:00:00Z'));
    const sep30 = { ...valid, weddingDate: '2026-09-30' };
    expect(errors({ ...sep30, timezone: 'America/New_York' })).toBeUndefined();
    expect(errors({ ...sep30, timezone: 'Asia/Kolkata' })).toEqual([
      ['weddingDate', 'Pick today or a later date'],
    ]);
  });

  it('explains missing and invalid fields', () => {
    expect(errors({ brideName: '', groomName: ' ', weddingDate: '', city: '' })).toEqual([
      ['brideName', "Enter the bride's name"],
      ['groomName', "Enter the groom's name"],
      ['weddingDate', 'Enter the wedding date'],
      ['city', 'Enter the city of your wedding'],
    ]);
    expect(errors({ ...valid, weddingDate: '2028-02-30' })).toEqual([
      ['weddingDate', 'Enter a valid date'],
    ]);
  });

  it('allows dates up to 5 years ahead in the chosen timezone', () => {
    // Today is 1 Oct 2026 in India.
    expect(errors({ ...valid, weddingDate: '2031-10-01' })).toBeUndefined();
    expect(errors({ ...valid, weddingDate: '2031-10-02' })).toEqual([
      ['weddingDate', 'Pick a date within the next 5 years'],
    ]);
    expect(errors({ ...valid, weddingDate: '9999-12-31' })).toEqual([
      ['weddingDate', 'Pick a date within the next 5 years'],
    ]);
  });

  it('needs at least one letter in each name, in any script', () => {
    expect(errors({ ...valid, brideName: '!!!', groomName: '123' })).toEqual([
      ['brideName', 'Use at least one letter'],
      ['groomName', 'Use at least one letter'],
    ]);
    expect(errors({ ...valid, brideName: 'നഫിയ', groomName: 'इरफ़ान' })).toBeUndefined();
  });

  it('stores timezones in their canonical spelling', () => {
    expect(createWeddingSchema.parse({ ...valid, timezone: 'asia/kolkata' }).timezone).toBe(
      'Asia/Kolkata',
    );
  });

  it('rejects unknown fields', () => {
    expect(errors({ ...valid, location: 'Kochi' })?.[0]?.[0]).toBe('');
  });
});
