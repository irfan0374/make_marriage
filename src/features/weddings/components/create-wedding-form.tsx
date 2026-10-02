'use client';

import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';
import { Button } from '@/components/ui/button';
import { DEFAULT_WEDDING_TIMEZONE, MAX_WEDDING_YEARS_AHEAD } from '@/config/constants';
import { useCreateWedding } from '@/features/weddings/hooks';
import { createWeddingSchema } from '@/modules/weddings/weddings.schemas';
import { addYears, todayIn } from '@/shared/dates';
import {
  SidesToggle,
  WeddingDetailFields,
  type WeddingDetailValues,
} from './wedding-detail-fields';

// Onboarding step 1 (PRD §6): the wedding's basics. Built from the Stitch
// "Onboarding: Create your wedding" screen.

const EMPTY: WeddingDetailValues = {
  brideName: '',
  groomName: '',
  weddingDate: '',
  city: '',
  venue: '',
  timezone: DEFAULT_WEDDING_TIMEZONE,
  sidesEnabled: false,
};

export function CreateWeddingForm() {
  const mutation = useCreateWedding();
  const { formRef, fieldErrors, formError, validate, showError, onInput } =
    useForm(createWeddingSchema);
  const [values, setValues] = useState(EMPTY);
  // "Today" depends on where the wedding is, so the date range follows the chosen timezone.
  const today = todayIn(values.timezone);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = validate(values);
    if (input) mutation.mutate(input, { onError: showError });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="space-y-5">
      <FormAlert message={formError} />
      <WeddingDetailFields
        values={values}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        errors={fieldErrors}
        dateMin={today}
        dateMax={addYears(today, MAX_WEDDING_YEARS_AHEAD)}
      />
      <div className="border-border border-t pt-5">
        <SidesToggle
          checked={values.sidesEnabled}
          onChange={(sidesEnabled) => setValues((v) => ({ ...v, sidesEnabled }))}
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
