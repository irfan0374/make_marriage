'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, GripVertical, Navigation, Pencil, Users } from 'lucide-react';
import { whenText, type EventStatus } from '@/features/events/event-timing';
import type { WeddingEvent } from '@/modules/events/events.types';
import { cn } from '@/shared/cn';

// One event on the timeline (Stitch "Events"): number, drag handle, name, when, website tag,
// edit; then venue and dress code. Invited families and attending come with Guests and RSVP.

const label = 'text-text-muted text-[11px] font-semibold tracking-[0.08em] uppercase';

function WebsiteTag({ shown }: { shown: boolean }) {
  return shown ? (
    <span className="bg-pending-bg text-pending-text inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      Shown on website
    </span>
  ) : (
    <span className="border-border text-text-muted inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium">
      Not shown on website
    </span>
  );
}

export function EventCard({
  event,
  number,
  status,
  invited,
  editing,
  canDrag,
  onEdit,
}: {
  event: WeddingEvent;
  number: number;
  status: EventStatus | undefined;
  /** Families and people invited to it (Guests); omitted when none. */
  invited?: { households: number; people: number };
  editing: boolean;
  canDrag: boolean;
  onEdit: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: event.id, disabled: !canDrag });
  const hasDetails = event.venueName || event.address || event.mapUrl || event.dressCode;
  const num = String(number).padStart(2, '0');

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative flex gap-4 sm:gap-6', isDragging && 'z-10')}
    >
      {/* Timeline number; the line behind it is drawn by the list. */}
      <div className="relative hidden w-10 shrink-0 justify-center pt-6 sm:flex">
        <span
          className={cn(
            'relative z-[1] flex size-9 items-center justify-center rounded-full border text-xs font-semibold',
            editing
              ? 'bg-primary border-primary text-primary-foreground ring-primary-tint ring-4'
              : 'bg-surface border-border text-text-muted',
          )}
        >
          {num}
        </span>
      </div>

      <article
        aria-label={event.name}
        className={cn(
          'border-border bg-surface rounded-card shadow-card min-w-0 flex-1 border p-5 transition-shadow sm:p-6',
          editing && 'border-l-primary border-l-4 shadow-lg',
          isDragging && 'border-primary shadow-xl',
        )}
      >
        <div className="flex items-start gap-3">
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Drag to reorder ${event.name}`}
            disabled={!canDrag}
            className={cn(
              'text-text-muted/60 hover:text-text mt-1 -ml-1 shrink-0 touch-none rounded-sm p-1',
              canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-40',
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-text-muted text-xs font-semibold sm:hidden">{num}</span>
              <h3 className="text-2xl leading-tight font-normal break-words">{event.name}</h3>
              {editing && (
                <span className="bg-primary-tint text-primary rounded-sm px-2 py-0.5 text-[11px] font-medium">
                  Editing
                </span>
              )}
            </div>
            <p className="text-text-muted mt-1 flex items-start gap-1.5 text-sm">
              <Clock aria-hidden className="text-pending-text mt-0.5 size-4 shrink-0" />
              {whenText(event)}
            </p>
          </div>
          <div className="hidden sm:block">
            <WebsiteTag shown={event.showOnWebsite} />
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${event.name}`}
            aria-pressed={editing}
            className={cn(
              'text-text hover:bg-background-alt shrink-0 rounded-sm p-2 transition-colors',
              editing && 'bg-primary-tint text-primary',
            )}
          >
            <Pencil aria-hidden className="size-4" />
          </button>
        </div>
        <div className="mt-2 sm:hidden">
          <WebsiteTag shown={event.showOnWebsite} />
        </div>

        {hasDetails ? (
          <div className="bg-background rounded-input mt-4 grid gap-4 p-4 sm:grid-cols-2">
            <div className="min-w-0">
              <p className={label}>Venue</p>
              {event.venueName ? (
                <p className="mt-1 text-base font-medium break-words">{event.venueName}</p>
              ) : (
                <p className="text-text-muted mt-1 text-sm">Not set yet</p>
              )}
              {event.address && (
                <p className="text-text-muted mt-0.5 text-xs break-words">{event.address}</p>
              )}
              {event.mapUrl && (
                <a
                  href={event.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pending-text mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                >
                  <Navigation aria-hidden className="size-3.5" />
                  View on Google Maps
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
            <div className="min-w-0">
              <p className={label}>Dress code</p>
              {event.dressCode ? (
                <p className="bg-background-alt mt-1.5 inline-block rounded-sm px-2.5 py-1.5 text-xs break-words">
                  {event.dressCode}
                </p>
              ) : (
                <p className="text-text-muted mt-1 text-sm">Not set yet</p>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="border-border text-text-muted hover:border-primary/40 hover:text-primary rounded-input mt-4 w-full border border-dashed p-3 text-left text-sm transition-colors"
          >
            Add the venue, address and dress code
          </button>
        )}

        {(invited || status) && (
          <div className="mt-4 flex items-center justify-between gap-3 text-xs">
            {invited ? (
              <p className="text-text-muted flex items-center gap-1.5">
                <Users aria-hidden className="size-3.5" />
                Invited families{' '}
                <strong className="text-text font-semibold">
                  {invited.households.toLocaleString('en-IN')}
                </strong>
                <span aria-hidden>·</span> People{' '}
                <strong className="text-text font-semibold">
                  {invited.people.toLocaleString('en-IN')}
                </strong>
              </p>
            ) : (
              <span />
            )}
            {status && (
              <p
                className={cn(
                  'font-medium',
                  status === 'next' ? 'text-pending-text' : 'text-text-muted',
                )}
              >
                {status === 'next' ? 'Next up' : 'Completed'}
              </p>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
