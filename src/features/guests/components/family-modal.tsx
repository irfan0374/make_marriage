'use client';

import { Minus, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { FormAlert, FormField, FormTextarea } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { findDuplicates } from '@/features/guests/api';
import { useCreateHousehold, useUpdateHousehold } from '@/features/guests/hooks';
import { timeAgo } from '@/features/tasks/task-groups';
import type { WeddingEvent } from '@/modules/events/events.types';
import {
  createHouseholdSchema,
  DISPLAY_NAME_MAX,
  HEADCOUNT_MAX,
  MAX_MEMBERS,
  MEMBER_NAME_MAX,
  NOTES_MAX,
  TAG_MAX,
} from '@/modules/households/households.schemas';
import type {
  Household,
  HouseholdSide,
  PossibleDuplicate,
} from '@/modules/households/households.types';
import { cn } from '@/shared/cn';
import { formatDate, todayIn } from '@/shared/dates';

// "Add family" / "Edit family" (Stitch "Guests (Interactive)"), as its own modal: a full-screen
// sheet on phones, a centred card on larger screens.

export type FamilyModalMode = { kind: 'new' } | { kind: 'edit'; household: Household };

interface Values {
  displayName: string;
  members: string[];
  headcount: number;
  /** Until the couple changes it, the headcount follows the number of members. */
  headcountTouched: boolean;
  side: HouseholdSide | null;
  email: string;
  phone: string;
  tags: string[];
  /** Invited events; the number is that event's people, or `null` to follow the headcount. */
  events: Record<string, number | null>;
  notes: string;
}

function initialValues(mode: FamilyModalMode, defaultSide: HouseholdSide | null): Values {
  if (mode.kind === 'edit') {
    const h = mode.household;
    return {
      displayName: h.displayName,
      members: [...h.members.map((m) => m.name), ''],
      headcount: h.headcount,
      headcountTouched: true,
      side: h.side,
      email: h.email ?? '',
      phone: h.phone ?? '',
      tags: h.tags,
      events: Object.fromEntries(
        h.invitedEvents.map((e) => [e.eventId, e.headcount === h.headcount ? null : e.headcount]),
      ),
      notes: h.notes,
    };
  }
  return {
    displayName: '',
    members: [''],
    headcount: 1,
    headcountTouched: false,
    side: defaultSide,
    email: '',
    phone: '',
    tags: [],
    events: {},
    notes: '',
  };
}

const REASON_TEXT: Record<PossibleDuplicate['reason'], string> = {
  phone: 'this phone number',
  email: 'this email',
  name: 'this name',
};

const SIDE_LABEL: Record<HouseholdSide, string> = { bride: 'Bride side', groom: 'Groom side' };

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const step =
    'text-primary hover:bg-primary-tint flex size-8 items-center justify-center rounded-full disabled:opacity-30';
  return (
    <div className="border-border bg-surface inline-flex items-center gap-1 rounded-full border p-0.5">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        className={step}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus aria-hidden className="size-3.5" />
      </button>
      <span aria-live="polite" className="w-7 text-center text-sm font-semibold">
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label}`}
        className={step}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

export function FamilyModal({
  weddingId,
  mode,
  events,
  guestTags,
  sidesEnabled,
  sideScope,
  timeZone,
  onClose,
  onSaved,
  onDelete,
}: {
  weddingId: string;
  mode: FamilyModalMode;
  events: WeddingEvent[];
  guestTags: string[];
  sidesEnabled: boolean;
  /** The side this person is limited to, or `null`. */
  sideScope: HouseholdSide | null;
  timeZone: string;
  onClose: () => void;
  onSaved: (household: Household) => void;
  onDelete: (household: Household) => void;
}) {
  const [saved] = useState(() => initialValues(mode, sideScope));
  const [values, setValues] = useState<Values>(saved);
  const [newTag, setNewTag] = useState('');
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[] | null>(null);
  const [checking, setChecking] = useState(false);
  const create = useCreateHousehold(weddingId);
  const update = useUpdateHousehold(weddingId);
  const pending = create.isPending || update.isPending || checking;
  // The side is required when the wedding has sides and this person picks it (PRD GUEST-1).
  const [schema] = useState(() =>
    sidesEnabled && !sideScope
      ? createHouseholdSchema.refine((v) => v.side !== null, {
          path: ['side'],
          message: 'Choose the bride side or the groom side',
        })
      : createHouseholdSchema,
  );
  const { formRef, fieldErrors, formError, validate, showError, onInput } = useForm(schema);
  const formId = useId();
  const newTagRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));
  /** Name, email or phone changed: a duplicate warning has to be looked at again. */
  const setIdentity = (patch: Partial<Values>) => {
    setDuplicates(null);
    set(patch);
  };

  function setMembers(members: string[]) {
    const named = members.filter((m) => m.trim() !== '').length;
    set({
      members,
      // The headcount follows the members until someone sets it by hand.
      ...(values.headcountTouched ? {} : { headcount: Math.max(named, 1) }),
    });
  }

  function setHeadcount(headcount: number) {
    // A family can't have more people at an event than it has.
    const events = Object.fromEntries(
      Object.entries(values.events).map(([id, n]) => [id, n !== null && n >= headcount ? null : n]),
    );
    set({ headcount, headcountTouched: true, events });
  }

  const allEvents = events.length > 0 && events.every((e) => e.id in values.events);
  function toggleEvent(eventId: string, on: boolean) {
    const next = { ...values.events };
    if (on) next[eventId] = null;
    else delete next[eventId];
    set({ events: next });
  }

  function toggleTag(tag: string) {
    const has = values.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
    set({
      tags: has
        ? values.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...values.tags, tag],
    });
  }

  function addNewTag() {
    const tag = newTag.trim().slice(0, TAG_MAX);
    if (!tag) return;
    if (!values.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      set({ tags: [...values.tags, tag] });
    }
    setNewTag('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      displayName: values.displayName,
      members: values.members.map((name) => ({ name })),
      headcount: values.headcount,
      email: values.email,
      phone: values.phone,
      side: sidesEnabled ? values.side : null,
      tags: values.tags,
      notes: values.notes,
      invitedEvents: Object.entries(values.events).map(([eventId, n]) => ({
        eventId,
        headcount: n ?? values.headcount,
      })),
    };
    const input = validate(payload);
    if (!input) return;

    // Possible duplicates are a warning (PRD GUEST-7): shown once, then "Add anyway" saves.
    if (duplicates === null) {
      const identityChanged =
        mode.kind === 'new' ||
        values.displayName.trim() !== saved.displayName.trim() ||
        values.email.trim() !== saved.email.trim() ||
        values.phone.trim() !== saved.phone.trim();
      if (identityChanged) {
        setChecking(true);
        try {
          const found = await findDuplicates(weddingId, {
            displayName: input.displayName,
            email: input.email ?? undefined,
            phone: input.phone ?? undefined,
            excludeId: mode.kind === 'edit' ? mode.household.id : undefined,
          });
          if (found.length > 0) {
            setDuplicates(found);
            return;
          }
        } catch {
          // The check is only a courtesy; saving still works without it.
        } finally {
          setChecking(false);
        }
      }
    }

    const onSuccess = (household: Household) => {
      onSaved(household);
      onClose();
    };
    if (mode.kind === 'new') create.mutate(input, { onSuccess, onError: showError });
    else update.mutate({ id: mode.household.id, input }, { onSuccess, onError: showError });
  }

  const tagOptions = [
    ...guestTags,
    ...values.tags.filter((t) => !guestTags.some((g) => g.toLowerCase() === t.toLowerCase())),
  ];
  const editing = mode.kind === 'edit' ? mode.household : null;
  const saveLabel = duplicates?.length
    ? mode.kind === 'new'
      ? 'Add anyway'
      : 'Save anyway'
    : mode.kind === 'new'
      ? 'Add family'
      : 'Save changes';

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={editing ? `Edit family · ${editing.displayName}` : 'Add family'}
      className="sm:max-w-2xl"
      footer={
        <div className="flex w-full flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          {editing ? (
            <button
              type="button"
              onClick={() => onDelete(editing)}
              disabled={pending}
              className="text-danger-text hover:bg-danger-bg flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium sm:-ml-2"
            >
              <Trash2 aria-hidden className="size-4" />
              Delete family
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="ghost" className="h-11 px-5" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={formId} className="h-11 px-6" disabled={pending}>
              {checking
                ? 'Checking…'
                : create.isPending || update.isPending
                  ? 'Saving…'
                  : saveLabel}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={formId}
        ref={formRef}
        onSubmit={submit}
        onInput={onInput}
        noValidate
        className="space-y-6"
      >
        <FormAlert message={formError} />
        <FormField
          label="Family name *"
          name="displayName"
          autoComplete="off"
          maxLength={DISPLAY_NAME_MAX}
          placeholder="e.g. Sharma family"
          value={values.displayName}
          onChange={(e) => setIdentity({ displayName: e.target.value })}
          error={fieldErrors.displayName}
          disabled={pending}
        />

        <fieldset name="members" className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Family members</legend>
          {values.members.map((name, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                aria-label={`Member ${index + 1}`}
                name="members"
                value={name}
                maxLength={MEMBER_NAME_MAX}
                placeholder={index === 0 ? 'e.g. Rajesh Sharma' : 'Another member'}
                onChange={(e) => {
                  const members = [...values.members];
                  members[index] = e.target.value;
                  setMembers(members);
                }}
                disabled={pending}
                className="border-border bg-surface placeholder:text-text-muted rounded-input focus-visible:border-primary focus-visible:ring-primary/15 h-11 flex-1 border px-3.5 text-sm outline-none focus-visible:ring-3"
              />
              {values.members.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove member ${index + 1}`}
                  onClick={() => setMembers(values.members.filter((_, i) => i !== index))}
                  className="text-text-muted hover:text-text hover:bg-background-alt rounded-full p-2"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>
          ))}
          {values.members.length < MAX_MEMBERS && (
            <button
              type="button"
              onClick={() => set({ members: [...values.members, ''] })}
              className="text-primary flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <Plus aria-hidden className="size-4" />
              Add member
            </button>
          )}
          {fieldErrors.members && <p className="text-danger-text text-xs">{fieldErrors.members}</p>}
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Total headcount</Label>
            <div>
              <Stepper
                value={values.headcount}
                min={1}
                max={HEADCOUNT_MAX}
                label="people"
                disabled={pending}
                onChange={setHeadcount}
              />
            </div>
            <p className="text-text-muted text-xs">
              Defaults to the number of members. Increase it for plus-ones or kids not listed.
            </p>
            {fieldErrors.headcount && (
              <p className="text-danger-text text-xs">{fieldErrors.headcount}</p>
            )}
          </div>

          {sidesEnabled && (
            <fieldset name="side" className="space-y-1.5">
              <legend className="mb-1.5 text-sm font-medium">Side *</legend>
              {sideScope ? (
                <p className="bg-primary-tint text-primary inline-block rounded-full px-3 py-1.5 text-sm font-medium">
                  {SIDE_LABEL[sideScope]}
                </p>
              ) : (
                <div className="bg-background rounded-input inline-grid grid-cols-2 gap-1 p-1">
                  {(['bride', 'groom'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      aria-pressed={values.side === side}
                      onClick={() => set({ side })}
                      disabled={pending}
                      className={cn(
                        'rounded-sm px-4 py-2 text-sm font-medium transition-colors',
                        values.side === side
                          ? 'bg-primary text-primary-foreground'
                          : 'text-text-muted hover:bg-surface',
                      )}
                    >
                      {SIDE_LABEL[side]}
                    </button>
                  ))}
                </div>
              )}
              {fieldErrors.side && <p className="text-danger-text text-xs">{fieldErrors.side}</p>}
            </fieldset>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Email (optional)"
              name="email"
              type="email"
              autoComplete="off"
              placeholder="rajesh@example.com"
              value={values.email}
              onChange={(e) => setIdentity({ email: e.target.value })}
              error={fieldErrors.email}
              disabled={pending}
            />
            <FormField
              label="Phone (optional)"
              name="phone"
              type="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              value={values.phone}
              onChange={(e) => setIdentity({ phone: e.target.value })}
              error={fieldErrors.phone}
              disabled={pending}
            />
          </div>
          <p className="text-text-muted text-xs">Used to send their invitation.</p>
        </div>

        <fieldset name="tags">
          <legend className="mb-2 text-sm font-medium">Tags</legend>
          <div className="flex flex-wrap items-center gap-2">
            {tagOptions.map((tag) => {
              const on = values.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(tag)}
                  disabled={pending}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    on
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border bg-surface hover:border-primary/40',
                  )}
                >
                  {tag}
                </button>
              );
            })}
            <span className="border-border focus-within:border-primary inline-flex items-center rounded-full border border-dashed pr-1 pl-3">
              <input
                ref={newTagRef}
                aria-label="New tag"
                value={newTag}
                maxLength={TAG_MAX}
                placeholder="New tag"
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNewTag();
                  }
                }}
                className="w-24 bg-transparent py-1.5 text-xs outline-none"
              />
              <button
                type="button"
                aria-label="Add this tag"
                onClick={addNewTag}
                className="text-primary hover:bg-primary-tint rounded-full p-1"
              >
                <Plus aria-hidden className="size-3.5" />
              </button>
            </span>
          </div>
          {fieldErrors.tags && (
            <p className="text-danger-text mt-1.5 text-xs">{fieldErrors.tags}</p>
          )}
        </fieldset>

        <fieldset name="invitedEvents">
          <legend className="mb-2 text-sm font-medium">Invite to events</legend>
          {events.length === 0 ? (
            <p className="text-text-muted text-sm">Add your events first, then choose them here.</p>
          ) : (
            <div className="border-border rounded-input divide-border/60 divide-y border">
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allEvents}
                  onChange={(e) =>
                    set({
                      events: e.target.checked
                        ? Object.fromEntries(
                            events.map((ev) => [ev.id, values.events[ev.id] ?? null]),
                          )
                        : {},
                    })
                  }
                  className="accent-primary size-4.5"
                />
                All events
              </label>
              {events.map((event) => {
                const on = event.id in values.events;
                const people = values.events[event.id] ?? values.headcount;
                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <label className="flex min-w-0 cursor-pointer items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggleEvent(event.id, e.target.checked)}
                        className="accent-primary size-4.5 shrink-0"
                      />
                      <span className="truncate">
                        {event.name}{' '}
                        <span className="text-text-muted">
                          ({formatDate(event.date).slice(0, -5)})
                        </span>
                      </span>
                    </label>
                    {on && (
                      <span className="flex shrink-0 items-center gap-2">
                        <Stepper
                          value={people}
                          min={1}
                          max={values.headcount}
                          label={`people for ${event.name}`}
                          disabled={pending}
                          onChange={(n) =>
                            set({
                              events: {
                                ...values.events,
                                [event.id]: n === values.headcount ? null : n,
                              },
                            })
                          }
                        />
                        <span className="text-text-muted hidden text-xs sm:inline">people</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {fieldErrors.invitedEvents && (
            <p className="text-danger-text mt-1.5 text-xs">{fieldErrors.invitedEvents}</p>
          )}
        </fieldset>

        <FormTextarea
          label="Notes for us"
          name="notes"
          rows={3}
          maxLength={NOTES_MAX}
          placeholder="e.g. Vegetarian. Needs airport pickup on 11 April."
          hint="Only your team sees this."
          value={values.notes}
          onChange={(e) => set({ notes: e.target.value })}
          error={fieldErrors.notes}
          disabled={pending}
        />

        {editing && (
          <p className="text-text-muted text-xs">
            {editing.createdBy &&
              `Added by ${editing.createdBy.name} on ${formatDate(todayIn(timeZone, new Date(editing.createdAt)))} · `}
            Last updated{editing.editedBy ? ` by ${editing.editedBy.name}` : ''} ·{' '}
            {timeAgo(editing.editedAt, timeZone)}
          </p>
        )}

        {duplicates && duplicates.length > 0 && (
          <div
            role="alert"
            className="bg-pending-bg text-pending-text rounded-input flex gap-3 p-4 text-sm"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              A family with {REASON_TEXT[duplicates[0]!.reason]} already exists:{' '}
              <strong className="font-semibold">
                {duplicates
                  .map((d) => `${d.displayName}${d.side ? ` (${SIDE_LABEL[d.side]})` : ''}`)
                  .join(', ')}
              </strong>
              . {mode.kind === 'new' ? 'Add anyway?' : 'Save anyway?'}
            </p>
          </div>
        )}
      </form>
    </Dialog>
  );
}
