'use client';

import { Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { FormAlert, FormField, FormTextarea } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useCreateEvent, useUpdateEvent } from '@/features/events/hooks';
import {
  ADDRESS_MAX,
  createEventSchema,
  DRESS_CODE_MAX,
  EVENT_NAME_MAX,
  EVENT_PRESETS,
  MAP_URL_MAX,
  NOTES_MAX,
  VENUE_NAME_MAX,
} from '@/modules/events/events.schemas';
import type { EventPresetKey, UpdateEventInput, WeddingEvent } from '@/modules/events/events.types';
import { cn } from '@/shared/cn';

// The New event / Edit event panel (Stitch "Add event"). Beside the timeline on desktop; a
// full-screen sheet on phones and tablets.

export type PanelMode =
  { kind: 'new'; presetKey?: EventPresetKey } | { kind: 'edit'; event: WeddingEvent };

interface Values {
  name: string;
  presetKey: EventPresetKey;
  date: string;
  startTime: string;
  endTime: string;
  venueName: string;
  address: string;
  mapUrl: string;
  dressCode: string;
  notes: string;
  showOnWebsite: boolean;
}

type TextField = 'name' | 'venueName' | 'address' | 'mapUrl' | 'dressCode' | 'notes';

function initialValues(mode: PanelMode): Values {
  if (mode.kind === 'edit') {
    const e = mode.event;
    return {
      name: e.name,
      presetKey: e.presetKey,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime ?? '',
      venueName: e.venueName,
      address: e.address,
      mapUrl: e.mapUrl ?? '',
      dressCode: e.dressCode,
      notes: e.notes,
      showOnWebsite: e.showOnWebsite,
    };
  }
  const preset = EVENT_PRESETS.find((p) => p.key === mode.presetKey);
  return {
    name: preset?.name ?? '',
    presetKey: preset?.key ?? 'custom',
    date: '',
    startTime: '',
    endTime: '',
    venueName: '',
    address: '',
    mapUrl: '',
    dressCode: '',
    notes: '',
    showOnWebsite: true,
  };
}

/** Fields that differ from the saved event; text compared trimmed, so a stray space isn't a change. */
function changedFields(values: Values, saved: Values): (keyof Values)[] {
  return (Object.keys(values) as (keyof Values)[]).filter((key) => {
    const a = values[key];
    const b = saved[key];
    return typeof a === 'string' && typeof b === 'string' ? a.trim() !== b.trim() : a !== b;
  });
}

export function EventPanel({
  weddingId,
  mode,
  onClose,
  onDelete,
  readOnly = false,
}: {
  weddingId: string;
  mode: PanelMode;
  onClose: () => void;
  onDelete: (event: WeddingEvent) => void;
  /** An archived wedding: the event can be read but not changed or deleted. */
  readOnly?: boolean;
}) {
  // The values the panel opened with; it remounts (by `key`) for another event.
  const [saved] = useState(() => initialValues(mode));
  const [values, setValues] = useState<Values>(saved);
  const create = useCreateEvent(weddingId);
  const update = useUpdateEvent(weddingId);
  const pending = create.isPending || update.isPending;
  const locked = pending || readOnly;
  const { formRef, fieldErrors, formError, validate, showError, onInput } =
    useForm(createEventSchema);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const websiteId = useId();

  // Move focus into the panel when it opens or switches event, for keyboard and screen readers.
  useEffect(() => panelRef.current?.focus({ preventScroll: true }), []);

  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  function chooseType(key: EventPresetKey) {
    const preset = EVENT_PRESETS.find((p) => p.key === key);
    const nameIsPreset = EVENT_PRESETS.some((p) => p.name === values.name.trim());
    set({
      presetKey: key,
      // A preset fills in its name unless the couple typed their own.
      ...(preset && (values.name.trim() === '' || nameIsPreset) ? { name: preset.name } : {}),
      ...(!preset && nameIsPreset ? { name: '' } : {}),
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    const input = validate(values);
    if (!input) return;
    if (mode.kind === 'new') {
      create.mutate(input, { onSuccess: onClose, onError: showError });
      return;
    }
    const changes = changedFields(values, saved);
    if (changes.length === 0) {
      onClose();
      return;
    }
    const patch = Object.fromEntries(changes.map((key) => [key, input[key]])) as UpdateEventInput;
    update.mutate(
      { eventId: mode.event.id, input: patch },
      { onSuccess: onClose, onError: showError },
    );
  }

  const text = (name: TextField) => ({
    name,
    value: values[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set({ [name]: e.target.value }),
    error: fieldErrors[name],
    disabled: locked,
  });

  const title =
    mode.kind === 'new' ? 'New event' : `${readOnly ? 'Event' : 'Edit event'} · ${mode.event.name}`;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className={cn(
        'bg-surface flex flex-col outline-none',
        // Phones and tablets: a full-screen sheet. Desktop: beside the timeline, below the top bar.
        'max-lg:fixed max-lg:inset-0 max-lg:z-50',
        'lg:border-border lg:rounded-card lg:shadow-card lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-hidden lg:border',
      )}
    >
      <div className="bg-background-alt/60 border-border/60 flex items-center justify-between gap-3 border-b px-6 py-5">
        <h2 id={titleId} className="flex min-w-0 items-center gap-3 text-xl font-normal">
          <span aria-hidden className="bg-pending-text size-2 shrink-0 rounded-full" />
          <span className="truncate">{title}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-text-muted hover:text-text hover:bg-background -mr-2 rounded-full p-2"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <form
        ref={formRef}
        onSubmit={submit}
        onInput={onInput}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <FormAlert message={formError} />

          {mode.kind === 'new' && (
            <fieldset>
              <legend className="mb-2.5 text-sm font-medium">Choose a type</legend>
              <div className="flex flex-wrap gap-2">
                {[...EVENT_PRESETS, { key: 'custom' as const, name: 'Custom' }].map((preset) => {
                  const selected = values.presetKey === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => chooseType(preset.key)}
                      disabled={locked}
                      className={cn(
                        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                        selected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border bg-surface hover:border-primary/40',
                      )}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <FormField
            label="Event name *"
            autoComplete="off"
            maxLength={EVENT_NAME_MAX}
            placeholder="e.g. Mehendi"
            {...text('name')}
          />
          <FormField
            label="Date *"
            name="date"
            type="date"
            value={values.date}
            onChange={(e) => set({ date: e.target.value })}
            error={fieldErrors.date}
            disabled={locked}
          />
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Start time *"
                name="startTime"
                type="time"
                value={values.startTime}
                onChange={(e) => set({ startTime: e.target.value })}
                error={fieldErrors.startTime}
                disabled={locked}
              />
              <FormField
                label="End time (optional)"
                name="endTime"
                type="time"
                value={values.endTime}
                onChange={(e) => set({ endTime: e.target.value })}
                error={fieldErrors.endTime}
                disabled={locked}
              />
            </div>
            <p className="text-text-muted text-xs">
              If it ends after midnight, we&apos;ll show it as the next day.
            </p>
          </div>
          <FormField
            label="Venue name"
            autoComplete="off"
            maxLength={VENUE_NAME_MAX}
            placeholder="e.g. Grand Hyatt Ballroom"
            {...text('venueName')}
          />
          <FormTextarea
            label="Venue address"
            rows={2}
            maxLength={ADDRESS_MAX}
            placeholder="e.g. Bolgatty Island, Kochi"
            {...text('address')}
          />
          <FormField
            label="Google Maps link"
            type="url"
            inputMode="url"
            autoComplete="off"
            maxLength={MAP_URL_MAX}
            placeholder="https://maps.google.com/..."
            {...text('mapUrl')}
          />
          <FormField
            label="Dress code"
            autoComplete="off"
            maxLength={DRESS_CODE_MAX}
            placeholder="e.g. Green & yellow"
            {...text('dressCode')}
          />
          <FormTextarea
            label="Notes for guests"
            rows={3}
            maxLength={NOTES_MAX}
            placeholder="e.g. Henna artists will be here from 4:30 PM."
            {...text('notes')}
          />
          <div className="bg-background rounded-input flex items-start justify-between gap-4 p-4">
            <div>
              <p id={`${websiteId}-label`} className="text-sm font-medium">
                Show on wedding website
              </p>
              <p id={`${websiteId}-hint`} className="text-text-muted mt-0.5 text-xs">
                Guests can see this event on your wedding website.
              </p>
            </div>
            {/* The switch is a span with role="switch", so it's named by id, not by a <label>. */}
            <Switch
              aria-labelledby={`${websiteId}-label`}
              aria-describedby={`${websiteId}-hint`}
              checked={values.showOnWebsite}
              onCheckedChange={(checked) => set({ showOnWebsite: checked })}
              disabled={locked}
            />
          </div>
        </div>

        {readOnly ? (
          <div className="border-border/60 flex items-center justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="h-11 px-6" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="border-border/60 flex items-center justify-between gap-3 border-t px-6 py-4">
            {mode.kind === 'edit' ? (
              <button
                type="button"
                onClick={() => onDelete(mode.event)}
                disabled={pending}
                className="text-danger-text hover:bg-danger-bg -ml-2 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
              >
                <Trash2 aria-hidden className="size-4" />
                Delete event
              </button>
            ) : (
              <Button type="button" variant="ghost" className="h-11 px-4" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button type="submit" className="h-11 px-6" disabled={pending}>
              {mode.kind === 'new'
                ? create.isPending
                  ? 'Adding…'
                  : 'Add event'
                : update.isPending
                  ? 'Saving…'
                  : 'Save changes'}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
