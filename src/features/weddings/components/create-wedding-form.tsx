'use client';

import { useId, useState } from 'react';
import { FormAlert, FormField, FormSelect } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DEFAULT_WEDDING_TIMEZONE,
  MAX_WEDDING_YEARS_AHEAD,
  WEDDING_TIMEZONES,
} from '@/config/constants';
import { useCreateWedding } from '@/features/weddings/hooks';
import {
  CITY_MAX,
  createWeddingSchema,
  PERSON_NAME_MAX,
  VENUE_MAX,
} from '@/modules/weddings/weddings.schemas';
import { addYears, todayIn } from '@/shared/dates';

// Onboarding step 1 (PRD §6): the wedding's basics. Built from the Stitch
// "Onboarding: Create your wedding" screen.

export function CreateWeddingForm() {
  const mutation = useCreateWedding();
  const { formRef, fieldErrors, formError, validate, showError, onInput } =
    useForm(createWeddingSchema);
  const [timezone, setTimezone] = useState<string>(DEFAULT_WEDDING_TIMEZONE);
  const [sidesEnabled, setSidesEnabled] = useState(false);
  const sidesId = useId();
  const today = todayIn(timezone);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = validate({
      brideName: form.get('brideName'),
      groomName: form.get('groomName'),
      weddingDate: form.get('weddingDate'),
      city: form.get('city'),
      venue: form.get('venue'),
      timezone,
      sidesEnabled,
    });
    if (input) mutation.mutate(input, { onError: showError });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="space-y-5">
      <FormAlert message={formError} />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Bride's name"
          name="brideName"
          autoComplete="off"
          maxLength={PERSON_NAME_MAX}
          placeholder="e.g. Nafiya"
          error={fieldErrors.brideName}
        />
        <FormField
          label="Groom's name"
          name="groomName"
          autoComplete="off"
          maxLength={PERSON_NAME_MAX}
          placeholder="e.g. Irfan"
          error={fieldErrors.groomName}
        />
      </div>
      <FormField
        label="Wedding date"
        name="weddingDate"
        type="date"
        // "Today" depends on where the wedding is, so it follows the chosen timezone.
        min={today}
        max={addYears(today, MAX_WEDDING_YEARS_AHEAD)}
        hint="Your main wedding day. We'll count down to it. You can change it later."
        error={fieldErrors.weddingDate}
      />
      <FormField
        label="City / region"
        name="city"
        autoComplete="address-level2"
        maxLength={CITY_MAX}
        placeholder="e.g. Kochi"
        hint="Where the wedding takes place."
        error={fieldErrors.city}
      />
      <FormField
        label="Wedding venue (optional)"
        name="venue"
        autoComplete="off"
        maxLength={VENUE_MAX}
        placeholder="e.g. Grand Hyatt, Bolgatty Island"
        hint="Helps your family, vendors and guests find the celebration."
        error={fieldErrors.venue}
      />
      <FormSelect
        label="Timezone"
        name="timezone"
        value={timezone}
        onChange={(event) => setTimezone(event.target.value)}
        options={WEDDING_TIMEZONES}
        hint="Used for the countdown and RSVP deadlines."
        error={fieldErrors.timezone}
      />

      <div className="border-border flex items-start justify-between gap-4 border-t pt-5">
        <div className="space-y-1">
          <p id={`${sidesId}-label`} className="text-text text-sm font-medium">
            Track bride side and groom side
          </p>
          <p id={`${sidesId}-hint`} className="text-text-muted text-xs">
            Label each guest family as bride&apos;s or groom&apos;s side, and give family members
            access to just one side.
          </p>
        </div>
        {/* The switch is a span with role="switch", so it's named by id, not by a <label>. */}
        <Switch
          aria-labelledby={`${sidesId}-label`}
          aria-describedby={`${sidesId}-hint`}
          checked={sidesEnabled}
          onCheckedChange={setSidesEnabled}
        />
      </div>

      <Button
        type="submit"
        className="h-11 w-full"
        // Stays disabled after success too, so a second click during navigation can't create a
        // duplicate wedding.
        disabled={mutation.isPending || mutation.isSuccess}
      >
        {mutation.isPending || mutation.isSuccess ? 'Creating…' : 'Create wedding'}
      </Button>
    </form>
  );
}
