'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ArrowDownWideNarrow, CalendarDays, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { eventStatuses, isInDateOrder, sortByDate } from '@/features/events/event-timing';
import { useEvents, useReorderEvents } from '@/features/events/hooks';
import { useHouseholdSummary } from '@/features/guests/hooks';
import { useRsvpSummary } from '@/features/invitations/hooks';
import { useWedding } from '@/features/weddings/hooks';
import { EVENT_PRESETS } from '@/modules/events/events.schemas';
import type { EventPresetKey, WeddingEvent } from '@/modules/events/events.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { todayIn } from '@/shared/dates';
import { DeleteEventDialog } from './delete-event-dialog';
import { EventCard } from './event-card';
import { EventPanel, type PanelMode } from './event-panel';
import { NotifyChangeDialog } from './notify-change-dialog';
import { QuickAddDialog } from './quick-add-dialog';
import { WeddingLoader } from '@/components/common/wedding-loader';

// The Events page (Stitch "Events", "Add event", "Events (Empty)"; PRD SETUP-2 to SETUP-5): the
// wedding's celebrations as a timeline, in the couple's order. Drag (or use the keyboard on the
// handle) to reorder; the panel adds and edits.

const outlineButton = 'border-border bg-surface h-10 gap-2 px-4 font-medium';

function EmptyState({
  onQuickAdd,
  onAdd,
}: {
  onQuickAdd: () => void;
  onAdd: (presetKey?: EventPresetKey) => void;
}) {
  return (
    <section className="border-border bg-surface rounded-card shadow-card mx-auto mt-4 max-w-2xl border px-6 py-12 text-center sm:px-10">
      <span className="bg-primary-tint text-primary mx-auto flex size-16 items-center justify-center rounded-full">
        <CalendarDays aria-hidden className="size-7" />
      </span>
      <h2 className="mt-6 text-3xl">Add your wedding events</h2>
      <p className="text-text-muted mx-auto mt-3 max-w-md">
        Mehendi, Haldi, Sangeet, the wedding day and more. Add them once and use them for
        invitations, RSVPs and your wedding website.
      </p>
      <Button className="mt-7 h-12 gap-2 px-6 text-base" onClick={onQuickAdd}>
        <Sparkles aria-hidden className="text-gold size-4" />
        Quick add events
      </Button>
      <p className="mt-4">
        <button
          type="button"
          onClick={() => onAdd()}
          className="text-sm font-medium underline underline-offset-4 hover:no-underline"
        >
          Or add a custom event
        </button>
      </p>
      <div className="border-border/70 mt-8 border-t pt-7">
        <p className="text-text-muted text-xs font-semibold tracking-[0.1em] uppercase">
          Popular Indian wedding celebrations
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {EVENT_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => onAdd(preset.key)}
              className="border-border hover:border-primary/40 hover:text-primary rounded-full border px-3.5 py-1.5 text-sm transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function EventsPage({ weddingId }: { weddingId: string }) {
  const { data: wedding } = useWedding(weddingId);
  const { data: events, error, isPending, refetch } = useEvents(weddingId);
  const reorder = useReorderEvents(weddingId);
  const { data: guestTotals } = useHouseholdSummary(weddingId);
  const { data: replies } = useRsvpSummary(weddingId);
  const [panel, setPanel] = useState<PanelMode | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [deleting, setDeleting] = useState<WeddingEvent | null>(null);
  const [notifying, setNotifying] = useState<WeddingEvent | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isPending) {
    return <WeddingLoader label="Loading your events" size="page" />;
  }
  if (error) {
    return (
      <div role="alert" className="space-y-3 py-20 text-center">
        <h1 className="text-2xl">We couldn&apos;t load your events</h1>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-primary font-medium hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const today = wedding ? todayIn(wedding.timezone) : '';
  const statuses = today ? eventStatuses(events, today) : new Map();
  const editingId = panel?.kind === 'edit' ? panel.event.id : null;
  // Archived weddings are read-only (the API refuses changes with WEDDING_ARCHIVED).
  const archived = wedding?.status === 'archived';
  const canReorder = events.length > 1 && !reorder.isPending && !archived;

  const invitedTo = (eventId: string) => {
    const totals = guestTotals?.events.find((t) => t.eventId === eventId);
    if (!totals) return undefined;
    const reply = replies?.events.find((t) => t.eventId === eventId);
    return { ...totals, attending: reply?.attendingHeadcount };
  };
  const nameOf = (id: UniqueIdentifier) => events.find((e) => e.id === id)?.name ?? 'Event';
  const positionOf = (id: UniqueIdentifier) => events.findIndex((e) => e.id === id) + 1;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!events || !over || active.id === over.id) return;
    const from = events.findIndex((e) => e.id === active.id);
    const to = events.findIndex((e) => e.id === over.id);
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(events, from, to));
  }

  function openPanel(mode: PanelMode) {
    setPanel(mode);
  }

  const reorderError =
    reorder.error instanceof ApiError && reorder.error.code === 'CONFLICT'
      ? 'Someone changed the events at the same time. The list has been refreshed; try again.'
      : reorder.error
        ? "The new order couldn't be saved. Please try again."
        : null;
  const count = events.length;

  return (
    <div className="pb-16">
      <header className="border-border/70 mb-8 flex flex-col gap-5 border-b pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-pending-text mb-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
            {count} {count === 1 ? 'event' : 'events'} planned
          </p>
          <h1 className="text-4xl font-normal tracking-tight md:text-5xl">Events</h1>
          <p className="text-text-muted mt-2">
            Plan each celebration.{count > 1 && !archived ? ' Drag to change the order.' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            className={outlineButton}
            disabled={!canReorder || isInDateOrder(events)}
            onClick={() => reorder.mutate(sortByDate(events))}
          >
            <ArrowDownWideNarrow aria-hidden className="size-4" />
            Sort by date
          </Button>
          <Button
            variant="outline"
            className={outlineButton}
            disabled={archived}
            onClick={() => setQuickAdd(true)}
          >
            <Sparkles aria-hidden className="text-gold size-4" />
            Quick add
          </Button>
          <Button
            className="h-10 gap-2 px-5"
            disabled={archived}
            onClick={() => openPanel({ kind: 'new' })}
          >
            <Plus aria-hidden className="size-4" />
            Add event
          </Button>
        </div>
      </header>

      {archived && (
        <p
          role="status"
          className="bg-pending-bg text-pending-text rounded-input mb-5 px-4 py-3 text-sm"
        >
          This wedding is archived, so its events can&apos;t be changed.
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {reorder.isPending ? 'Saving the new order…' : reorder.isSuccess ? 'Order saved.' : ''}
      </p>
      {reorderError && (
        <p
          role="alert"
          className="bg-danger-bg text-danger-text rounded-input mb-5 px-4 py-3 text-sm"
        >
          {reorderError}
        </p>
      )}

      {count === 0 && !panel && !archived ? (
        <EmptyState
          onQuickAdd={() => setQuickAdd(true)}
          onAdd={(presetKey) => openPanel({ kind: 'new', presetKey })}
        />
      ) : (
        <div className={cn('grid gap-8', panel && 'lg:grid-cols-[minmax(0,1fr)_400px]')}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{
              screenReaderInstructions: {
                draggable:
                  'To move an event, press Space or Enter, use the arrow keys to move it, then press Space or Enter again to drop it. Press Escape to cancel.',
              },
              announcements: {
                onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
                onDragOver: ({ active, over }) =>
                  over
                    ? `${nameOf(active.id)} is now at position ${positionOf(over.id)}.`
                    : undefined,
                onDragEnd: ({ active, over }) =>
                  over
                    ? `${nameOf(active.id)} moved to position ${positionOf(over.id)}.`
                    : `${nameOf(active.id)} dropped.`,
                onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
              },
            }}
          >
            <SortableContext items={events.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <ol aria-label="Events in order" className="relative space-y-5">
                {count > 1 && (
                  <span
                    aria-hidden
                    className="bg-border absolute top-8 bottom-8 left-5 hidden w-px sm:block"
                  />
                )}
                {events.map((event, index) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    number={index + 1}
                    status={statuses.get(event.id)}
                    invited={invitedTo(event.id)}
                    editing={editingId === event.id}
                    canDrag={canReorder}
                    onEdit={() => openPanel({ kind: 'edit', event })}
                  />
                ))}
                {count === 0 && (
                  <li className="text-text-muted rounded-card border-border border border-dashed p-8 text-center text-sm">
                    {archived ? 'No events were added.' : 'Your first event will appear here.'}
                  </li>
                )}
              </ol>
            </SortableContext>
          </DndContext>

          {panel && (
            <EventPanel
              key={panel.kind === 'edit' ? panel.event.id : `new-${panel.presetKey ?? ''}`}
              weddingId={weddingId}
              mode={panel}
              onClose={() => setPanel(null)}
              onDelete={setDeleting}
              onGuestFacingChange={setNotifying}
              readOnly={archived}
            />
          )}
        </div>
      )}

      {quickAdd && wedding && !archived && (
        <QuickAddDialog
          weddingId={weddingId}
          weddingDate={wedding.weddingDate}
          events={events}
          onClose={() => setQuickAdd(false)}
        />
      )}
      {notifying && (
        <NotifyChangeDialog
          weddingId={weddingId}
          event={notifying}
          onClose={() => setNotifying(null)}
        />
      )}
      {deleting && (
        <DeleteEventDialog
          weddingId={weddingId}
          event={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}
