'use client';

import { CalendarDays, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { whenText } from '@/features/events/event-timing';
import { useDeleteEvent } from '@/features/events/hooks';
import type { WeddingEvent } from '@/modules/events/events.types';
import { ApiError } from '@/shared/api-client';

// "Delete Sangeet?" (Stitch "Delete event?"). If families are invited, the API asks for
// confirmation first; the dialog then explains what goes with the event and asks again.

export function DeleteEventDialog({
  weddingId,
  event,
  onClose,
  onDeleted,
}: {
  weddingId: string;
  event: WeddingEvent;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteEvent(weddingId);
  const [invited, setInvited] = useState<number | null>(null);

  function remove() {
    mutation.mutate(
      { eventId: event.id, confirm: invited !== null },
      {
        onSuccess: onDeleted,
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'CONFIRMATION_REQUIRED') {
            const details = error.details as { affectedHouseholds?: number } | undefined;
            setInvited(details?.affectedHouseholds ?? 0);
          }
        },
      },
    );
  }

  const error =
    mutation.error instanceof ApiError && mutation.error.code === 'CONFIRMATION_REQUIRED'
      ? null
      : mutation.error
        ? mutation.error instanceof ApiError
          ? mutation.error.message
          : 'Could not reach the server. Check your connection and try again.'
        : null;
  const where = event.venueName ? ` · ${event.venueName}` : '';

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${event.name}?`}
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Keep event
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-6"
            disabled={mutation.isPending}
            onClick={remove}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete event'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-text-muted flex items-start gap-2">
          <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0" />
          {whenText(event)}
          {where}
        </p>
        {invited !== null && invited > 0 && (
          <div
            role="alert"
            className="bg-danger-bg text-danger-text rounded-input flex items-start gap-3 p-4"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">
                {invited} {invited === 1 ? 'family is' : 'families are'} invited to this event.
              </p>
              <p>
                Their replies for {event.name} will be removed, and it will be taken off tasks,
                expenses and vendors that mention it. Photos move to the General album.
              </p>
            </div>
          </div>
        )}
        <p>This can&apos;t be undone.</p>
        <FormAlert message={error} />
      </div>
    </Dialog>
  );
}
