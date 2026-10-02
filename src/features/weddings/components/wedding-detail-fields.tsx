'use client';

import { useId } from 'react';
import { FormField, FormSelect } from '@/components/common/form-field';
import { Switch } from '@/components/ui/switch';
import { WEDDING_TIMEZONES } from '@/config/constants';
import { CITY_MAX, PERSON_NAME_MAX, VENUE_MAX } from '@/modules/weddings/weddings.schemas';
import type { Wedding } from '@/modules/weddings/weddings.types';

// The wedding's details, shared by the create form (onboarding) and the settings page, so both
// ask the same questions with the same limits.

export interface WeddingDetailValues {
  brideName: string;
  groomName: string;
  weddingDate: string;
  city: string;
  venue: string;
  timezone: string;
  sidesEnabled: boolean;
}

export function detailValuesOf(wedding: Wedding): WeddingDetailValues {
  return {
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    weddingDate: wedding.weddingDate,
    city: wedding.city,
    venue: wedding.venue,
    timezone: wedding.timezone,
    sidesEnabled: wedding.sidesEnabled,
  };
}

type Change = (patch: Partial<WeddingDetailValues>) => void;

/** A timezone outside the picker's list (set through the API) stays selectable. */
function timezoneOptions(current: string) {
  return WEDDING_TIMEZONES.some((tz) => tz.value === current)
    ? WEDDING_TIMEZONES
    : [...WEDDING_TIMEZONES, { value: current, label: current }];
}

export function WeddingDetailFields({
  values,
  onChange,
  errors,
  dateMin,
  dateMax,
  disabled,
}: {
  values: WeddingDetailValues;
  onChange: Change;
  errors: Record<string, string>;
  dateMin?: string;
  dateMax?: string;
  disabled?: boolean;
}) {
  const text = (name: 'brideName' | 'groomName' | 'city' | 'venue') => ({
    name,
    value: values[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ [name]: event.target.value }),
    error: errors[name],
    disabled,
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Bride's name"
          autoComplete="off"
          maxLength={PERSON_NAME_MAX}
          placeholder="e.g. Nafiya"
          {...text('brideName')}
        />
        <FormField
          label="Groom's name"
          autoComplete="off"
          maxLength={PERSON_NAME_MAX}
          placeholder="e.g. Irfan"
          {...text('groomName')}
        />
      </div>
      <FormField
        label="Wedding date"
        name="weddingDate"
        type="date"
        value={values.weddingDate}
        onChange={(event) => onChange({ weddingDate: event.target.value })}
        min={dateMin}
        max={dateMax}
        hint="Your main wedding day. We'll count down to it."
        error={errors.weddingDate}
        disabled={disabled}
      />
      <FormField
        label="City / region"
        autoComplete="address-level2"
        maxLength={CITY_MAX}
        placeholder="e.g. Kochi"
        hint="Where the wedding takes place."
        {...text('city')}
      />
      <FormField
        label="Wedding venue (optional)"
        autoComplete="off"
        maxLength={VENUE_MAX}
        placeholder="e.g. Grand Hyatt, Bolgatty Island"
        hint="Helps your family, vendors and guests find the celebration."
        {...text('venue')}
      />
      <FormSelect
        label="Timezone"
        name="timezone"
        value={values.timezone}
        onChange={(event) => onChange({ timezone: event.target.value })}
        options={timezoneOptions(values.timezone)}
        hint="Used for the countdown and RSVP deadlines."
        error={errors.timezone}
        disabled={disabled}
      />
    </div>
  );
}

export function SidesToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p id={`${id}-label`} className="text-text text-sm font-medium">
          Track bride side and groom side
        </p>
        <p id={`${id}-hint`} className="text-text-muted text-xs">
          Label each guest family as bride&apos;s or groom&apos;s side, and give family members
          access to just one side.
        </p>
      </div>
      {/* The switch is a span with role="switch", so it's named by id, not by a <label>. */}
      <Switch
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
