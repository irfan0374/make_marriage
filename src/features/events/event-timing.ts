import type { WeddingEvent } from '@/modules/events/events.types';
import { formatDate, formatTime } from '@/shared/dates';

// How events read on the page: times, "past midnight", and which one is next. Client-safe and
// pure, so the dashboard and the events page agree.

type Timed = Pick<WeddingEvent, 'id' | 'date' | 'startTime' | 'endTime'>;

/** An end time earlier than the start means the event runs into the next day. */
export function endsNextDay(event: Pick<Timed, 'startTime' | 'endTime'>): boolean {
  return event.endTime !== null && event.endTime < event.startTime;
}

/** "4:00 PM – 9:00 PM", "7:00 PM – 1:30 AM (next day)" or "11:00 AM onwards". */
export function timeRange(event: Pick<Timed, 'startTime' | 'endTime'>): string {
  const start = formatTime(event.startTime);
  if (event.endTime === null) return `${start} onwards`;
  return `${start} – ${formatTime(event.endTime)}${endsNextDay(event) ? ' (next day)' : ''}`;
}

/** "12 Apr 2028 · 4:00 PM – 9:00 PM". */
export function whenText(event: Pick<Timed, 'date' | 'startTime' | 'endTime'>): string {
  return `${formatDate(event.date)} · ${timeRange(event)}`;
}

const byDateTime = (a: Timed, b: Timed) =>
  a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);

/** Earliest first; events on the same day by start time. Doesn't change the input. */
export function sortByDate<T extends Timed>(events: readonly T[]): T[] {
  return [...events].sort(byDateTime);
}

/** Whether the saved order already is date order (then "Sort by date" has nothing to do). */
export function isInDateOrder(events: readonly Timed[]): boolean {
  return events.every((event, i) => i === 0 || byDateTime(events[i - 1]!, event) <= 0);
}

/** Events from `today` (the wedding's date) onwards, soonest first. */
export function upcomingEvents<T extends Timed>(
  events: readonly T[],
  today: string,
  limit = 3,
): T[] {
  return sortByDate(events.filter((event) => event.date >= today)).slice(0, limit);
}

export type EventStatus = 'completed' | 'next';

/** Past events are "completed"; the soonest from today on is "next". Others have no status. */
export function eventStatuses(events: readonly Timed[], today: string): Map<string, EventStatus> {
  const statuses = new Map<string, EventStatus>();
  for (const event of events) if (event.date < today) statuses.set(event.id, 'completed');
  const next = upcomingEvents(events, today, 1)[0];
  if (next) statuses.set(next.id, 'next');
  return statuses;
}

/** Date tile parts: "12" and "APR". */
export function dateTile(date: string): { day: string; month: string } {
  const [, month = '1', day = '1'] = date.split('-');
  const name = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, Number(month) - 1, 1)),
  );
  return { day: String(Number(day)), month: name.toUpperCase() };
}
