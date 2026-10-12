'use client';

import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useBulkHouseholds, useDeleteHousehold } from '@/features/guests/hooks';
import type { WeddingEvent } from '@/modules/events/events.types';
import { TAG_MAX } from '@/modules/households/households.schemas';
import type { Household } from '@/modules/households/households.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { formatDate } from '@/shared/dates';

// Confirmations and bulk pickers for the Guests page (Stitch "Guests (Interactive)").

const SIDE_LABEL = { bride: 'Bride side', groom: 'Groom side' } as const;

function messageOf(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError
    ? error.message
    : 'Could not reach the server. Check your connection and try again.';
}

function RepliesWarning({ replies, many }: { replies: number; many: boolean }) {
  return (
    <div
      role="alert"
      className="bg-danger-bg text-danger-text rounded-input flex gap-3 p-4 text-sm"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        {replies > 0
          ? `They've already replied for ${replies} ${replies === 1 ? 'event' : 'events'}. Their replies will be deleted too, and their ${many ? 'invitation links' : 'invitation link'} will stop working.`
          : `Their ${many ? 'invitation links' : 'invitation link'} will stop working.`}
      </p>
    </div>
  );
}

export function DeleteFamilyDialog({
  weddingId,
  household,
  onClose,
  onDeleted,
}: {
  weddingId: string;
  household: Household;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteHousehold(weddingId);
  const facts = [
    `${household.headcount} ${household.headcount === 1 ? 'person' : 'people'}`,
    household.side ? SIDE_LABEL[household.side] : null,
    `invited to ${household.invitedEvents.length} ${household.invitedEvents.length === 1 ? 'event' : 'events'}`,
  ].filter(Boolean);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${household.displayName}?`}
      description={facts.join(' · ')}
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Keep family
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-6"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(household.id, { onSuccess: onDeleted })}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete family'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <RepliesWarning replies={household.rsvps.length} many={false} />
        <p>This can&apos;t be undone.</p>
        <FormAlert message={messageOf(mutation.error)} />
      </div>
    </Dialog>
  );
}

export function BulkDeleteDialog({
  weddingId,
  households,
  onClose,
  onDone,
}: {
  weddingId: string;
  households: Household[];
  onClose: () => void;
  onDone: () => void;
}) {
  const mutation = useBulkHouseholds(weddingId);
  const count = households.length;
  const replies = households.reduce((sum, h) => sum + h.rsvps.length, 0);
  const shown = households.slice(0, 5).map((h) => h.displayName);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${count} ${count === 1 ? 'family' : 'families'}?`}
      description={`${shown.join(', ')}${count > shown.length ? ` and ${count - shown.length} more` : ''}`}
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Keep them
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-6"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { action: 'delete', householdIds: households.map((h) => h.id) },
                { onSuccess: onDone },
              )
            }
          >
            {mutation.isPending
              ? 'Deleting…'
              : `Delete ${count} ${count === 1 ? 'family' : 'families'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <RepliesWarning replies={replies} many />
        <p>This can&apos;t be undone.</p>
        <FormAlert message={messageOf(mutation.error)} />
      </div>
    </Dialog>
  );
}

/** "Invite to events" from the bulk bar: each family gets the event for its whole headcount. */
export function BulkEventsDialog({
  weddingId,
  householdIds,
  events,
  onClose,
  onDone,
}: {
  weddingId: string;
  householdIds: string[];
  events: WeddingEvent[];
  onClose: () => void;
  onDone: (updated: number) => void;
}) {
  const mutation = useBulkHouseholds(weddingId);
  const [chosen, setChosen] = useState<string[]>([]);
  const count = householdIds.length;
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Invite to events"
      description={`Add the chosen events to ${count} ${count === 1 ? 'family' : 'families'}, for their whole headcount. Families already invited stay as they are.`}
      footer={
        <>
          <Button variant="ghost" className="h-11 px-5" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-11 px-6"
            disabled={chosen.length === 0 || mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { action: 'assign_events', householdIds, eventIds: chosen },
                { onSuccess: (r) => onDone(r.updated) },
              )
            }
          >
            {mutation.isPending ? 'Inviting…' : 'Invite'}
          </Button>
        </>
      }
    >
      <FormAlert message={messageOf(mutation.error)} />
      {events.length === 0 ? (
        <p className="text-text-muted text-sm">Add your events first.</p>
      ) : (
        <ul className="border-border rounded-input divide-border/60 divide-y border">
          {events.map((event) => (
            <li key={event.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.includes(event.id)}
                  onChange={(e) =>
                    setChosen((c) =>
                      e.target.checked ? [...c, event.id] : c.filter((id) => id !== event.id),
                    )
                  }
                  className="accent-primary size-4.5"
                />
                <span className="flex-1">{event.name}</span>
                <span className="text-text-muted text-xs">{formatDate(event.date)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** "Add tag" from the bulk bar: pick existing tags or type a new one. */
export function BulkTagDialog({
  weddingId,
  householdIds,
  guestTags,
  onClose,
  onDone,
}: {
  weddingId: string;
  householdIds: string[];
  guestTags: string[];
  onClose: () => void;
  onDone: (updated: number) => void;
}) {
  const mutation = useBulkHouseholds(weddingId);
  const [chosen, setChosen] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const options = [...guestTags, ...chosen.filter((t) => !guestTags.includes(t))];
  const tags = [...chosen, ...(newTag.trim() ? [newTag.trim()] : [])];
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Add tag"
      description={`Tag ${householdIds.length} ${householdIds.length === 1 ? 'family' : 'families'}.`}
      footer={
        <>
          <Button variant="ghost" className="h-11 px-5" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-11 px-6"
            disabled={tags.length === 0 || mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { action: 'add_tags', householdIds, tags },
                { onSuccess: (r) => onDone(r.updated) },
              )
            }
          >
            {mutation.isPending ? 'Adding…' : 'Add tag'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormAlert message={messageOf(mutation.error)} />
        {options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map((tag) => {
              const on = chosen.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChosen((c) => (on ? c.filter((t) => t !== tag) : [...c, tag]))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium',
                    on
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border hover:border-primary/40',
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Or a new tag</span>
          <input
            value={newTag}
            maxLength={TAG_MAX}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="e.g. Out of town"
            className="border-border bg-surface rounded-input focus-visible:border-primary h-11 w-full border px-3.5 text-sm outline-none"
          />
        </label>
      </div>
    </Dialog>
  );
}
