import { describe, expect, it } from 'vitest';
import { amountPaise, calendarDate, clockTime, objectIdString } from './common';

describe('common schemas', () => {
  it('objectIdString', () => {
    expect(objectIdString.safeParse('66f1b0000000000000000001').success).toBe(true);
    expect(objectIdString.safeParse('66f1b0').success).toBe(false);
  });

  it('calendarDate accepts real dates only', () => {
    expect(calendarDate.safeParse('2028-04-14').success).toBe(true);
    expect(calendarDate.safeParse('2028-02-30').success).toBe(false);
    expect(calendarDate.safeParse('14-04-2028').success).toBe(false);
  });

  it('clockTime is 24-hour HH:mm', () => {
    expect(clockTime.safeParse('18:30').success).toBe(true);
    expect(clockTime.safeParse('24:00').success).toBe(false);
    expect(clockTime.safeParse('18:30:00').success).toBe(false);
  });

  it('amountPaise is a positive integer up to ₹1 billion', () => {
    expect(amountPaise.safeParse(125050).success).toBe(true);
    expect(amountPaise.safeParse(12.5).success).toBe(false);
    expect(amountPaise.safeParse(0).success).toBe(false);
    expect(amountPaise.safeParse(100_000_000_001).success).toBe(false);
  });
});
