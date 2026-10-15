import type { PublicSite, PublicSiteEvent } from '@/modules/website/website.types';
import { formatFullDate, formatTime } from '@/shared/dates';

// Small text helpers for the public wedding website. Client-safe.

/** "4:00 PM – 9:00 PM", or "7:00 PM onwards" without an end time. */
export function timeRange(event: Pick<PublicSiteEvent, 'startTime' | 'endTime'>): string {
  const start = formatTime(event.startTime);
  return event.endTime ? `${start} – ${formatTime(event.endTime)}` : `${start} onwards`;
}

/** "Day 01" for the first date with events, "Day 02" for the next, and so on. */
export function dayLabels(events: PublicSiteEvent[]): Map<string, string> {
  const dates = [...new Set(events.map((e) => e.date))].sort();
  return new Map(dates.map((d, i) => [d, `Day ${String(i + 1).padStart(2, '0')}`]));
}

/** "Morning", "Afternoon" or "Evening" from a `HH:mm` start. */
export function partOfDay(startTime: string): string {
  const hour = Number(startTime.slice(0, 2));
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

/** "N & I" from the couple's first letters. */
export function monogramOf(site: Pick<PublicSite, 'brideName' | 'groomName'>): string {
  return `${site.brideName.trim().charAt(0).toUpperCase()} & ${site.groomName.trim().charAt(0).toUpperCase()}`;
}

export const coupleOf = (site: Pick<PublicSite, 'brideName' | 'groomName'>) =>
  `${site.brideName} & ${site.groomName}`;

/** The event's map link, or a Google Maps search for its venue. */
export function directionsUrl(event: PublicSiteEvent): string | null {
  if (event.mapUrl) return event.mapUrl;
  const place = [event.venueName, event.address].filter(Boolean).join(', ');
  return place
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
    : null;
}

/** "Grand Hyatt Ballroom" and "Bolgatty Island, Kochi" as two lines (either may be empty). */
export function venueLines(event: PublicSiteEvent): { venue: string; address: string } {
  return { venue: event.venueName || event.address, address: event.venueName ? event.address : '' };
}

export { formatFullDate };

/** A Google Calendar link for the live stream, an hour long by default. */
export function calendarLink(title: string, startsAt: string, siteUrl: string): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `Watch live: ${siteUrl}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Short names browsers don't give for the wedding timezones (they say "GMT+5:30"). */
const ZONE_NAMES: Record<string, string> = {
  'Asia/Kolkata': 'IST',
  'Asia/Dubai': 'GST',
  'Asia/Singapore': 'SGT',
};

/** "14 April 2028 · 11:00 AM IST" in the wedding's timezone. */
export function streamStartLabel(startsAt: string, timeZone: string): string {
  const at = new Date(startsAt);
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(at);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(at);
  const zone =
    ZONE_NAMES[timeZone] ??
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
  return `${date} · ${time}${zone ? ` ${zone}` : ''}`;
}
