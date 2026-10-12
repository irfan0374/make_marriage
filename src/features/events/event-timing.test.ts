import { describe, expect, it } from 'vitest';
import { formatTime } from '@/shared/dates';
import {
  dateTile,
  endsNextDay,
  eventStatuses,
  isInDateOrder,
  sortByDate,
  timeRange,
  upcomingEvents,
  whenText,
} from './event-timing';

const ev = (id: string, date: string, startTime: string, endTime: string | null = null) => ({
  id,
  date,
  startTime,
  endTime,
});

describe('formatTime', () => {
  it('uses a 12-hour clock', () => {
    expect(formatTime('00:00')).toBe('12:00 AM');
    expect(formatTime('09:05')).toBe('9:05 AM');
    expect(formatTime('12:30')).toBe('12:30 PM');
    expect(formatTime('23:59')).toBe('11:59 PM');
  });
});

describe('time ranges', () => {
  it('shows start and end, "onwards" without an end, and past midnight', () => {
    expect(timeRange(ev('a', '2028-04-12', '16:00', '21:00'))).toBe('4:00 PM – 9:00 PM');
    expect(timeRange(ev('a', '2028-04-12', '11:00'))).toBe('11:00 AM onwards');
    expect(timeRange(ev('a', '2028-04-13', '19:00', '01:30'))).toBe('7:00 PM – 1:30 AM (next day)');
    expect(endsNextDay(ev('a', '2028-04-13', '19:00', '01:30'))).toBe(true);
    expect(endsNextDay(ev('a', '2028-04-13', '19:00', '23:30'))).toBe(false);
    expect(whenText(ev('a', '2028-04-12', '16:00', '21:00'))).toBe(
      '12 Apr 2028 · 4:00 PM – 9:00 PM',
    );
  });
});

describe('ordering and status', () => {
  const events = [
    ev('wedding', '2028-04-14', '11:00'),
    ev('sangeet', '2028-04-13', '19:00'),
    ev('haldi', '2028-04-13', '09:30'),
    ev('engagement', '2028-01-10', '11:00'),
  ];

  it('sorts by date, then start time', () => {
    expect(sortByDate(events).map((e) => e.id)).toEqual([
      'engagement',
      'haldi',
      'sangeet',
      'wedding',
    ]);
    expect(isInDateOrder(events)).toBe(false);
    expect(isInDateOrder(sortByDate(events))).toBe(true);
  });

  it('marks past events completed and the soonest upcoming one next', () => {
    const statuses = eventStatuses(events, '2028-04-13');
    expect(statuses.get('engagement')).toBe('completed');
    expect(statuses.get('haldi')).toBe('next');
    expect(statuses.has('sangeet')).toBe(false);
    expect(upcomingEvents(events, '2028-04-13').map((e) => e.id)).toEqual([
      'haldi',
      'sangeet',
      'wedding',
    ]);
  });

  it('makes date tiles', () => {
    expect(dateTile('2028-04-09')).toEqual({ day: '9', month: 'APR' });
  });
});
