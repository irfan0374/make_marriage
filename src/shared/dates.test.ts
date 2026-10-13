import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addYears,
  zonedTimeToUtc,
  canonicalTimeZone,
  daysUntil,
  formatDate,
  formatLongDate,
  todayIn,
} from './dates';

describe('todayIn', () => {
  it('uses the calendar date in the given timezone, not UTC', () => {
    // 20:00 UTC on 30 Sep is already 1 Oct (01:30) in India.
    const now = new Date('2026-09-30T20:00:00Z');
    expect(todayIn('UTC', now)).toBe('2026-09-30');
    expect(todayIn('Asia/Kolkata', now)).toBe('2026-10-01');
  });
});

describe('daysUntil', () => {
  const now = new Date('2026-10-01T06:00:00Z'); // 11:30 in India

  it('counts whole calendar days', () => {
    expect(daysUntil('2026-10-01', 'Asia/Kolkata', now)).toBe(0);
    expect(daysUntil('2026-10-02', 'Asia/Kolkata', now)).toBe(1);
    expect(daysUntil('2028-04-14', 'Asia/Kolkata', now)).toBe(561);
    expect(daysUntil('2026-09-30', 'Asia/Kolkata', now)).toBe(-1);
  });

  it('crosses a month and a leap day correctly', () => {
    const feb = new Date('2028-02-28T06:00:00Z');
    expect(daysUntil('2028-03-01', 'Asia/Kolkata', feb)).toBe(2);
  });
});

describe('formatDate', () => {
  it('formats as "14 Apr 2028" and "Friday, 14 Apr 2028"', () => {
    expect(formatDate('2028-04-14')).toBe('14 Apr 2028');
    expect(formatLongDate('2028-04-14')).toBe('Friday, 14 Apr 2028');
  });
});

describe('addYears', () => {
  it('adds whole years, moving 29 Feb to 28 Feb in a non-leap year', () => {
    expect(addYears('2026-10-02', 5)).toBe('2031-10-02');
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29');
  });
});

describe('canonicalTimeZone', () => {
  it('fixes the capitalisation of a valid timezone', () => {
    expect(canonicalTimeZone('europe/london')).toBe('Europe/London');
    expect(canonicalTimeZone('asia/kolkata', ['Asia/Kolkata'])).toBe('Asia/Kolkata');
    expect(canonicalTimeZone('UTC')).toBe('UTC');
  });
});

describe('addMonths and addDays', () => {
  it('moves by months, keeping the day or using the month end', () => {
    expect(addMonths('2028-04-14', -10)).toBe('2027-06-14');
    expect(addMonths('2028-03-31', -1)).toBe('2028-02-29');
    expect(addMonths('2027-12-31', 2)).toBe('2028-02-29');
  });

  it('moves by days across months and years', () => {
    expect(addDays('2027-12-30', 6)).toBe('2028-01-05');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('zonedTimeToUtc', () => {
  it('converts India time to UTC', () => {
    expect(zonedTimeToUtc('2028-04-12', '16:00', 'Asia/Kolkata').toISOString()).toBe(
      '2028-04-12T10:30:00.000Z',
    );
  });

  it('respects daylight saving in London', () => {
    expect(zonedTimeToUtc('2028-07-01', '18:00', 'Europe/London').toISOString()).toBe(
      '2028-07-01T17:00:00.000Z',
    );
    expect(zonedTimeToUtc('2028-01-15', '18:00', 'Europe/London').toISOString()).toBe(
      '2028-01-15T18:00:00.000Z',
    );
  });

  it('handles times near midnight', () => {
    expect(zonedTimeToUtc('2028-04-12', '00:30', 'Asia/Kolkata').toISOString()).toBe(
      '2028-04-11T19:00:00.000Z',
    );
  });
});
