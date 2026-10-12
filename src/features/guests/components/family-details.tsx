'use client';

import { Mail, NotebookPen, Pencil, Phone, X } from 'lucide-react';
import type { WeddingEvent } from '@/modules/events/events.types';
import type { Household } from '@/modules/households/households.types';
import { formatDate, todayIn } from '@/shared/dates';
import { formatPhone } from '@/shared/phone';
import { dateTile } from '@/features/events/event-timing';

// The family details panel beside the list (Stitch "Guests"): who they are, how to reach them,
// and the events they're invited to. Replies and the invitation link arrive with Invitations.

const SIDE_LABEL = { bride: 'Bride side', groom: 'Groom side' } as const;
const box = 'bg-background rounded-input p-4';
const label = 'text-text-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase';

export function SideChip({ side }: { side: Household['side'] }) {
  if (!side) return null;
  return (
    <span
      className={
        side === 'bride'
          ? 'bg-primary-tint text-primary rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap'
          : 'bg-pending-bg text-pending-text rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap'
      }
    >
      {SIDE_LABEL[side]}
    </span>
  );
}

export function FamilyDetails({
  household,
  events,
  timeZone,
  onEdit,
  onClose,
}: {
  household: Household;
  events: WeddingEvent[];
  timeZone: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const invited = household.invitedEvents
    .map((i) => ({ ...i, event: events.find((e) => e.id === i.eventId) }))
    .filter((i): i is typeof i & { event: WeddingEvent } => Boolean(i.event));
  const people = `${household.headcount} ${household.headcount === 1 ? 'person' : 'people'}`;

  return (
    <aside
      aria-label={`${household.displayName} details`}
      className="border-border bg-surface rounded-card shadow-card space-y-5 border p-6 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-2xl font-normal">
            <span className="truncate">{household.displayName}</span>
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${household.displayName}`}
              className="text-text-muted hover:text-primary hover:bg-primary-tint rounded-full p-1.5"
            >
              <Pencil aria-hidden className="size-4" />
            </button>
          </h2>
          <p className="text-text-muted mt-1 flex items-center gap-2 text-sm">
            <SideChip side={household.side} />
            {household.side ? `· ${people}` : people}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="text-text-muted hover:text-text hover:bg-background -mr-2 rounded-full p-2"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <section className={box}>
        <h3 className={label}>Members &amp; primary contact</h3>
        <p className="text-sm">
          {household.members.length > 0
            ? household.members.map((m) => m.name).join(', ')
            : 'No member names yet'}
        </p>
        {(household.email || household.phone) && (
          <p className="text-text-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {household.email && (
              <a
                href={`mailto:${household.email}`}
                className="flex items-center gap-1.5 hover:underline"
              >
                <Mail aria-hidden className="size-3.5" />
                {household.email}
              </a>
            )}
            {household.phone && (
              <a
                href={`tel:${household.phone}`}
                className="flex items-center gap-1.5 hover:underline"
              >
                <Phone aria-hidden className="size-3.5" />
                {formatPhone(household.phone)}
              </a>
            )}
          </p>
        )}
        {household.tags.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-1.5">
            {household.tags.map((tag) => (
              <span
                key={tag}
                className="bg-surface border-border rounded-full border px-2.5 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </p>
        )}
      </section>

      {household.notes && (
        <section className={box}>
          <h3 className={`${label} flex items-center justify-between`}>
            Notes for us
            <NotebookPen aria-hidden className="text-pending-text size-4" />
          </h3>
          <p className="text-sm whitespace-pre-line">{household.notes}</p>
        </section>
      )}

      <section>
        <h3 className={`${label} flex items-center justify-between`}>
          Event invites
          <span className="text-pending-text tracking-normal normal-case">
            {invited.length} {invited.length === 1 ? 'event' : 'events'}
          </span>
        </h3>
        {invited.length === 0 ? (
          <p className="text-text-muted text-sm">Not invited to any event yet.</p>
        ) : (
          <ul className="space-y-2">
            {invited.map(({ event, headcount }) => {
              const tile = dateTile(event.date);
              return (
                <li key={event.id} className={`${box} flex items-center gap-3 py-3`}>
                  <span className="bg-primary-tint text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                    {tile.day}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{event.name}</p>
                    <p className="text-text-muted text-xs">
                      {formatDate(event.date).slice(0, -5)} · {headcount} invited
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-text-muted border-border/60 border-t pt-4 text-xs">
        Their invitation link and replies appear here once invitations are ready.
        {household.createdBy && (
          <span className="mt-1 block">
            Added by {household.createdBy.name} on{' '}
            {formatDate(todayIn(timeZone, new Date(household.createdAt)))}
          </span>
        )}
      </p>
    </aside>
  );
}
