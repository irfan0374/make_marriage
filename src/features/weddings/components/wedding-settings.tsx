'use client';

import { ArrowLeft, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';
import { useUnsavedChanges } from '@/components/common/use-unsaved-changes';
import { Button } from '@/components/ui/button';
import { MAX_WEDDING_YEARS_AHEAD } from '@/config/constants';
import { useUpdateWedding, useWedding } from '@/features/weddings/hooks';
import {
  canCheckWeddingDate,
  updateWeddingSchema,
  weddingDateProblem,
} from '@/modules/weddings/weddings.schemas';
import type { Wedding } from '@/modules/weddings/weddings.types';
import { addYears, todayIn } from '@/shared/dates';
import {
  detailValuesOf,
  SidesToggle,
  WeddingDetailFields,
  type WeddingDetailValues,
} from './wedding-detail-fields';

// Wedding settings (api-spec §6.3), admins only. Built from the "Wedding details" and
// "Bride side & groom side" parts of the Stitch "Settings" screen; the rest of that screen
// (tags, expense categories, archive, vendor radius) arrives with those features.

const card = 'border-border bg-surface rounded-card border p-6 md:p-8';

/**
 * Only the fields that differ from the saved wedding are sent. Text is compared trimmed, as the
 * server saves it, so adding a space alone doesn't count as a change.
 */
function changedFields(values: WeddingDetailValues, saved: WeddingDetailValues) {
  const clean = (value: string | boolean) => (typeof value === 'string' ? value.trim() : value);
  return Object.fromEntries(
    (Object.keys(values) as (keyof WeddingDetailValues)[])
      .filter((key) => clean(values[key]) !== clean(saved[key]))
      .map((key) => [key, clean(values[key])]),
  ) as Partial<WeddingDetailValues>;
}

function SettingsForm({ wedding, onDiscard }: { wedding: Wedding; onDiscard: () => void }) {
  const router = useRouter();
  const original = useMemo(() => detailValuesOf(wedding), [wedding]);
  // Only the fields this person has edited. The rest always show the latest saved wedding, so a
  // refetch after someone else saves updates them without touching edits here, and saving can't
  // send back (and undo) another admin's change to a field left alone.
  const [edits, setEdits] = useState<Partial<WeddingDetailValues>>({});
  const values: WeddingDetailValues = { ...original, ...edits };
  const mutation = useUpdateWedding(wedding.id);
  const archived = wedding.status === 'archived';

  // Same rule as the API: a new date must be from today to 5 years ahead; a kept one is fine.
  const schema = useMemo(
    () =>
      updateWeddingSchema.check((ctx) => {
        const { weddingDate } = ctx.value;
        if (weddingDate === undefined) return;
        const timezone = ctx.value.timezone ?? original.timezone;
        if (!canCheckWeddingDate(weddingDate, timezone)) return;
        const message = weddingDateProblem(weddingDate, timezone);
        if (message) {
          ctx.issues.push({ code: 'custom', input: weddingDate, path: ['weddingDate'], message });
        }
      }),
    [original.timezone],
  );
  const { formRef, fieldErrors, formError, validate, showError, onInput } = useForm(schema);

  const changes = changedFields(values, original);
  const dirty = Object.keys(changes).length > 0;
  // Ask before leaving with unsaved edits, but not while saving or on the way back afterwards.
  useUnsavedChanges(dirty && !mutation.isPending && !mutation.isSuccess);
  const today = todayIn(values.timezone);
  // A date already in the past stays as it is; a new one can't be earlier than today.
  const dateMin = original.weddingDate < today ? undefined : today;

  function change(patch: Partial<WeddingDetailValues>) {
    setEdits((e) => ({ ...e, ...patch }));
  }

  // Saved: back to the dashboard, which confirms it (`?saved=1`). `replace` swaps out the extra
  // history entry the unsaved-changes guard added, so Back from the dashboard isn't doubled.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = validate(changes);
    if (!input) return;
    mutation.mutate(input, {
      onError: showError,
      onSuccess: () => router.replace(`/app/${wedding.id}?saved=1`),
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="space-y-6">
      <div>
        <h1 className="text-3xl">Settings</h1>
        <p className="text-text-muted mt-1 text-sm">
          Your wedding&apos;s details. Only the couple can change these.
        </p>
      </div>

      {archived && (
        <p
          role="status"
          className="bg-pending-bg text-pending-text rounded-input px-4 py-3 text-sm"
        >
          This wedding is archived, so its details can&apos;t be changed.
        </p>
      )}
      <FormAlert message={formError} />

      <section className={card}>
        <h2 className="text-xl">Wedding details</h2>
        <p className="text-text-muted mt-1 text-sm">Basic information about your celebration.</p>
        <div className="mt-6">
          <WeddingDetailFields
            values={values}
            onChange={change}
            errors={fieldErrors}
            dateMin={dateMin}
            dateMax={addYears(today, MAX_WEDDING_YEARS_AHEAD)}
            disabled={archived}
          />
        </div>
      </section>

      <section className={card}>
        <h2 className="text-xl">Bride side &amp; groom side</h2>
        <div className="mt-4">
          <SidesToggle
            checked={values.sidesEnabled}
            onChange={(sidesEnabled) => change({ sidesEnabled })}
            disabled={archived}
          />
          {original.sidesEnabled && !values.sidesEnabled && (
            <p
              role="note"
              className="bg-pending-bg text-pending-text rounded-input mt-4 flex gap-2 px-4 py-3 text-sm"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Turning this off hides bride and groom side labels everywhere, and family members
                limited to one side will see every guest family. You can turn it back on later.
              </span>
            </p>
          )}
        </div>
      </section>

      {/* Actions at the bottom of the form, pinned to the bottom of the screen while scrolling so
          Save is always within reach. */}
      <div className="border-border bg-background sticky bottom-0 -mx-5 flex flex-col gap-3 border-t px-5 py-4 sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:px-0">
        <p className="text-text-muted text-sm" aria-live="polite">
          {dirty ? 'You have unsaved changes.' : 'No changes yet.'}
        </p>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 px-6 sm:flex-none"
            disabled={!dirty || mutation.isPending}
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button
            type="submit"
            className="h-11 flex-1 px-6 sm:flex-none"
            disabled={!dirty || archived || mutation.isPending || mutation.isSuccess}
          >
            {mutation.isPending || mutation.isSuccess ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function WeddingSettings({ weddingId }: { weddingId: string }) {
  const { data: wedding, error, isPending, refetch } = useWedding(weddingId);
  // Discard remounts the form from the saved wedding, clearing values and errors together.
  const [resets, setResets] = useState(0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/app/${weddingId}`}
        className="text-text-muted hover:text-text inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to dashboard
      </Link>
      {isPending ? (
        <p role="status" className="text-text-muted py-20 text-center">
          Loading settings…
        </p>
      ) : error ? (
        <div role="alert" className="space-y-3 py-20 text-center">
          <p className="text-text-muted">We couldn&apos;t load this wedding.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-primary font-medium hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <SettingsForm
          // Discard starts the form again from the saved wedding. A refetch alone doesn't
          // remount, so edits in progress are kept.
          key={resets}
          wedding={wedding}
          onDiscard={() => setResets((n) => n + 1)}
        />
      )}
    </div>
  );
}
