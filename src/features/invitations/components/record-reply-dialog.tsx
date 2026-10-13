'use client';

import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useClearRsvp, useRecordRsvp } from '@/features/invitations/hooks';
import type { WeddingEvent } from '@/modules/events/events.types';
import { RSVP_NOTE_MAX } from '@/modules/households/households.schemas';
import type { Household } from '@/modules/households/households.types';
import { ApiError } from '@/shared/api-client';
import { formatDate } from '@/shared/dates';
import { ReplyPicker, type ReplyValue } from './reply-picker';

// "Record reply" for a family (PRD INV-17): a reply taken by phone or WhatsApp, saved as
// "Recorded by host". Works after the deadline too.

export function RecordReplyDialog({
  weddingId,
  household,
  event,
  invited,
  onClose,
}: {
  weddingId: string;
  household: Household;
  event: WeddingEvent;
  /** People invited from this family for this event. */
  invited: number;
  onClose: () => void;
}) {
  const current = household.rsvps.find((r) => r.eventId === event.id);
  const [value, setValue] = useState<ReplyValue>({
    status: current?.status ?? null,
    attendingCount: current?.status === 'attending' ? current.attendingCount : 0,
  });
  const [note, setNote] = useState(current?.note ?? '');
  const record = useRecordRsvp(weddingId);
  const clear = useClearRsvp(weddingId);
  const pending = record.isPending || clear.isPending;
  const error = record.error ?? clear.error;

  function save() {
    if (!value.status) return;
    record.mutate(
      {
        householdId: household.id,
        eventId: event.id,
        input: {
          status: value.status,
          attendingCount: value.status === 'attending' ? value.attendingCount : 0,
          note: note.trim(),
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Record reply for ${event.name}`}
      description={`${household.displayName} · ${formatDate(event.date)} · ${invited} invited`}
      footer={
        <>
          {current ? (
            <Button
              variant="ghost"
              className="text-danger-text hover:bg-danger-bg mr-auto h-11 px-4"
              disabled={pending}
              onClick={() =>
                clear.mutate(
                  { householdId: household.id, eventId: event.id },
                  { onSuccess: onClose },
                )
              }
            >
              Clear reply
            </Button>
          ) : null}
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Cancel
          </Button>
          <Button className="h-11 px-6" disabled={!value.status || pending} onClick={save}>
            {record.isPending ? 'Saving…' : 'Save reply'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormAlert
          message={
            error
              ? error instanceof ApiError
                ? error.message
                : 'Could not reach the server. Check your connection and try again.'
              : null
          }
        />
        <div className="bg-background rounded-card p-5">
          <ReplyPicker
            question={`Will ${household.displayName} attend?`}
            value={value}
            max={invited}
            onChange={setValue}
            disabled={pending}
          />
        </div>
        <label className="block">
          <span className="text-sm font-medium">Note (optional)</span>
          <input
            value={note}
            maxLength={RSVP_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Confirmed by phone with Rajesh"
            className="border-border bg-surface rounded-input mt-1.5 h-11 w-full border px-4 text-sm"
          />
        </label>
        {current?.recordedBy === 'guest' && (
          <p className="text-text-muted text-xs">
            The family replied themselves. Saving here replaces their reply.
          </p>
        )}
      </div>
    </Dialog>
  );
}
