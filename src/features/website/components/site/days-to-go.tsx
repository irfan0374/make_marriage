'use client';

import { cn } from '@/shared/cn';
import { daysUntil } from '@/shared/dates';
import { useNow } from '../../use-now';

/**
 * The hero chip "182 days to go" ("Tomorrow", "Today"); nothing once the day has passed.
 * Counted in the browser after it loads (the server's copy may be cached), so the page never
 * shows yesterday's number and the server and browser first render the same thing.
 */
export function DaysToGo({
  date,
  timeZone,
  className,
  dotClassName,
}: {
  date: string;
  timeZone: string;
  className?: string;
  dotClassName?: string;
}) {
  const now = useNow(60_000);
  if (now === null) return null;
  const days = daysUntil(date, timeZone, new Date(now));
  if (days < 0) return null;
  const text = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days to go`;
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full px-4 py-1.5', className)}>
      <span className={cn('size-2 rounded-full', dotClassName)} />
      <span className="text-xs font-medium tracking-wider uppercase">{text}</span>
    </span>
  );
}
