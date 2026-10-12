'use client';

import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAddPresetEvents } from '@/features/events/hooks';
import {
  addPresetEventsSchema,
  EVENT_PRESETS,
  type PresetKey,
} from '@/modules/events/events.schemas';
import type { WeddingEvent } from '@/modules/events/events.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';

// "Quick add events" (Stitch): tick the celebrations you're having and give each a date and
// start time. Venue, dress code and the rest can be added later from each event.

interface Row {
  checked: boolean;
  date: string;
  startTime: string;
}

export function QuickAddDialog({
  weddingId,
  weddingDate,
  events,
  onClose,
}: {
  weddingId: string;
  /** The main wedding day: the "Wedding" row starts with it. */
  weddingDate: string;
  events: WeddingEvent[];
  onClose: () => void;
}) {
  const mutation = useAddPresetEvents(weddingId);
  const [rows, setRows] = useState<Record<PresetKey, Row>>(
    () =>
      Object.fromEntries(
        EVENT_PRESETS.map((p) => [
          p.key,
          { checked: false, date: p.key === 'wedding' ? weddingDate : '', startTime: '' },
        ]),
      ) as Record<PresetKey, Row>,
  );
  const [errors, setErrors] = useState<Partial<Record<PresetKey, string>>>({});
  const added = new Set(events.map((e) => e.presetKey));
  const chosen = EVENT_PRESETS.filter((p) => rows[p.key].checked);

  const setRow = (key: PresetKey, patch: Partial<Row>) => {
    setRows((r) => ({ ...r, [key]: { ...r[key], ...patch } }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  function submit() {
    const missing: Partial<Record<PresetKey, string>> = {};
    for (const p of chosen) {
      const row = rows[p.key];
      if (!row.date && !row.startTime) missing[p.key] = 'Choose a date and start time';
      else if (!row.date) missing[p.key] = 'Choose a date';
      else if (!row.startTime) missing[p.key] = 'Choose a start time';
    }
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;
    const input = addPresetEventsSchema.safeParse({
      events: chosen.map((p) => ({
        presetKey: p.key,
        date: rows[p.key].date,
        startTime: rows[p.key].startTime,
      })),
    });
    if (!input.success) return;
    mutation.mutate(input.data, { onSuccess: onClose });
  }

  const error = mutation.error
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : 'Could not reach the server. Check your connection and try again.'
    : null;
  const count = chosen.length;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Quick add events"
      description="Pick the celebrations you're having. You can add details like venue and dress code later."
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="ghost" className="h-11 px-5" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-11 px-6"
            disabled={count === 0 || mutation.isPending}
            onClick={submit}
          >
            {mutation.isPending
              ? 'Adding…'
              : count === 0
                ? 'Add events'
                : `Add ${count} ${count === 1 ? 'event' : 'events'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-2.5">
        <FormAlert message={error} />
        {EVENT_PRESETS.map((preset) => {
          const row = rows[preset.key];
          const rowError = errors[preset.key];
          const id = `quick-${preset.key}`;
          return (
            <div
              key={preset.key}
              className={cn(
                'rounded-input border p-3 transition-colors',
                row.checked ? 'border-primary/30 bg-background' : 'border-border/70 bg-surface',
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id={id}
                  type="checkbox"
                  checked={row.checked}
                  onChange={(e) => setRow(preset.key, { checked: e.target.checked })}
                  className="accent-primary size-4.5 shrink-0 cursor-pointer"
                />
                <label
                  htmlFor={id}
                  className={cn(
                    'flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-base',
                    !row.checked && 'text-text-muted',
                  )}
                >
                  {preset.name}
                  {added.has(preset.key) && (
                    <span className="bg-background-alt text-text-muted rounded-full px-2 py-0.5 text-[11px] font-medium">
                      Already added
                    </span>
                  )}
                </label>
                {row.checked && (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Input
                      type="date"
                      aria-label={`${preset.name} date`}
                      value={row.date}
                      onChange={(e) => setRow(preset.key, { date: e.target.value })}
                      aria-invalid={rowError && !row.date ? true : undefined}
                      className="h-9 flex-1 text-xs sm:w-36"
                    />
                    <Input
                      type="time"
                      aria-label={`${preset.name} start time`}
                      value={row.startTime}
                      onChange={(e) => setRow(preset.key, { startTime: e.target.value })}
                      aria-invalid={rowError && !row.startTime ? true : undefined}
                      className="h-9 w-28 text-xs"
                    />
                  </div>
                )}
              </div>
              {rowError && (
                <p role="alert" className="text-danger-text mt-2 text-xs sm:pl-7.5">
                  {rowError}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
