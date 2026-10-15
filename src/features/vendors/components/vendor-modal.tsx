'use client';

import { useState } from 'react';
import { FormAlert, FormField, FormSelect, FormTextarea } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useCreateVendor, useUpdateVendor } from '@/features/vendors/hooks';
import type { WeddingEvent } from '@/modules/events/events.types';
import {
  CONTACT_MAX,
  createVendorSchema,
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  VENDOR_NAME_MAX,
  VENDOR_NOTES_MAX,
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
} from '@/modules/vendors/vendors.schemas';
import type {
  UpdateVendorInput,
  Vendor,
  VendorCategory,
  VendorStatus,
} from '@/modules/vendors/vendors.types';
import { cn } from '@/shared/cn';
import { parseRupees, rupeesInput } from '@/shared/money';

// "Add vendor" / "Edit vendor" (Stitch "Vendors"), as its own modal like Add family: a
// full-screen sheet on phones, a centred card on larger screens.

export type VendorModalMode = { kind: 'new' } | { kind: 'edit'; vendor: Vendor };

interface Values {
  name: string;
  category: VendorCategory | '';
  status: VendorStatus;
  contactName: string;
  contactRole: string;
  phone: string;
  whatsapp: string;
  email: string;
  /** Rupees as typed. */
  contract: string;
  eventIds: string[];
  notes: string;
}

function initialValues(mode: VendorModalMode): Values {
  if (mode.kind === 'edit') {
    const v = mode.vendor;
    return {
      name: v.name,
      category: v.category,
      status: v.status,
      contactName: v.contactName,
      contactRole: v.contactRole,
      phone: v.phone ?? '',
      whatsapp: v.whatsapp ?? '',
      email: v.email ?? '',
      contract: rupeesInput(v.contractAmountPaise),
      eventIds: v.eventIds,
      notes: v.notes,
    };
  }
  return {
    name: '',
    category: '',
    status: 'shortlisted',
    contactName: '',
    contactRole: '',
    phone: '',
    whatsapp: '',
    email: '',
    contract: '',
    eventIds: [],
    notes: '',
  };
}

export function VendorModal({
  weddingId,
  mode,
  events,
  onClose,
  onSaved,
}: {
  weddingId: string;
  mode: VendorModalMode;
  events: WeddingEvent[];
  onClose: () => void;
  onSaved: (vendor: Vendor) => void;
}) {
  const [values, setValues] = useState(() => initialValues(mode));
  const create = useCreateVendor(weddingId);
  const update = useUpdateVendor(weddingId);
  const pending = create.isPending || update.isPending;
  const { formRef, fieldErrors, formError, validate, showError, onInput } =
    useForm(createVendorSchema);
  const [contractError, setContractError] = useState<string | null>(null);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const contractAmountPaise = values.contract.trim() === '' ? null : parseRupees(values.contract);
    if (values.contract.trim() !== '' && contractAmountPaise === null) {
      setContractError('Enter an amount like 1,50,000');
      return;
    }
    setContractError(null);
    const input = validate({
      name: values.name,
      category: values.category,
      status: values.status,
      contactName: values.contactName,
      contactRole: values.contactRole,
      phone: values.phone,
      whatsapp: values.whatsapp,
      email: values.email,
      eventIds: values.eventIds,
      notes: values.notes,
      contractAmountPaise,
    });
    if (!input) return;
    if (mode.kind === 'new') {
      create.mutate(input, { onSuccess: onSaved, onError: showError });
    } else {
      update.mutate(
        { id: mode.vendor.id, input: input as UpdateVendorInput },
        { onSuccess: onSaved, onError: showError },
      );
    }
  }

  const toggleEvent = (id: string) =>
    set({
      eventIds: values.eventIds.includes(id)
        ? values.eventIds.filter((e) => e !== id)
        : [...values.eventIds, id],
    });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={mode.kind === 'new' ? 'Add vendor' : `Edit ${mode.vendor.name}`}
      description="Who they are, how to reach them, and what you've agreed."
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="vendor-form" className="h-11 px-6" disabled={pending}>
            {pending ? 'Saving…' : mode.kind === 'new' ? 'Add vendor' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form
        id="vendor-form"
        ref={formRef}
        onSubmit={submit}
        onInput={onInput}
        noValidate
        className="space-y-5"
      >
        <FormAlert message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Vendor name *"
            name="name"
            autoComplete="off"
            maxLength={VENDOR_NAME_MAX}
            placeholder="e.g. Lens & Light Studios"
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            error={fieldErrors.name}
            disabled={pending}
          />
          <FormSelect
            label="Category *"
            name="category"
            options={[
              { value: '', label: 'Choose a category' },
              ...VENDOR_CATEGORIES.map((c) => ({ value: c, label: VENDOR_CATEGORY_LABELS[c] })),
            ]}
            value={values.category}
            onChange={(e) => set({ category: e.target.value as VendorCategory })}
            error={fieldErrors.category}
            disabled={pending}
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Status</legend>
          <div className="bg-background rounded-input grid grid-cols-3 gap-1 p-1">
            {VENDOR_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={values.status === status}
                onClick={() => set({ status })}
                disabled={pending}
                className={cn(
                  'rounded-sm px-2 py-2 text-xs font-medium transition-colors',
                  values.status === status
                    ? 'bg-primary text-primary-foreground'
                    : 'text-text-muted hover:bg-surface',
                )}
              >
                {VENDOR_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Contact person"
            name="contactName"
            autoComplete="off"
            maxLength={CONTACT_MAX}
            placeholder="e.g. Rohan Varma"
            value={values.contactName}
            onChange={(e) => set({ contactName: e.target.value })}
            error={fieldErrors.contactName}
            disabled={pending}
          />
          <FormField
            label="Their role"
            name="contactRole"
            autoComplete="off"
            maxLength={CONTACT_MAX}
            placeholder="e.g. Lead photographer"
            value={values.contactRole}
            onChange={(e) => set({ contactRole: e.target.value })}
            error={fieldErrors.contactRole}
            disabled={pending}
          />
          <FormField
            label="Phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+91 98765 43210"
            value={values.phone}
            onChange={(e) => set({ phone: e.target.value })}
            error={fieldErrors.phone}
            disabled={pending}
          />
          <div className="space-y-1.5">
            <FormField
              label="WhatsApp"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              value={values.whatsapp}
              onChange={(e) => set({ whatsapp: e.target.value })}
              error={fieldErrors.whatsapp}
              disabled={pending}
            />
            {values.phone && values.whatsapp !== values.phone && (
              <button
                type="button"
                onClick={() => set({ whatsapp: values.phone })}
                className="text-primary text-xs font-medium hover:underline"
              >
                Same as phone
              </button>
            )}
          </div>
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="hello@vendor.com"
            value={values.email}
            onChange={(e) => set({ email: e.target.value })}
            error={fieldErrors.email}
            disabled={pending}
          />
          <FormField
            label="Contract amount (₹)"
            name="contractAmountPaise"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 1,50,000"
            value={values.contract}
            onChange={(e) => set({ contract: e.target.value })}
            error={contractError ?? fieldErrors.contractAmountPaise}
            hint="Optional: the agreed price. What you've paid comes from expenses."
            disabled={pending}
          />
        </div>

        {events.length > 0 && (
          <fieldset name="eventIds">
            <legend className="mb-2 text-sm font-medium">Events they&apos;re working</legend>
            <div className="flex flex-wrap gap-2">
              {events.map((event) => {
                const on = values.eventIds.includes(event.id);
                return (
                  <button
                    key={event.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleEvent(event.id)}
                    disabled={pending}
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                      on
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border bg-surface hover:border-primary/40',
                    )}
                  >
                    {event.name}
                  </button>
                );
              })}
            </div>
            {fieldErrors.eventIds && (
              <p className="text-danger-text mt-1.5 text-xs">{fieldErrors.eventIds}</p>
            )}
          </fieldset>
        )}

        <FormTextarea
          label="Scope & notes"
          name="notes"
          rows={4}
          maxLength={VENDOR_NOTES_MAX}
          placeholder="What's included, deliverables, timings, anything to remember…"
          value={values.notes}
          onChange={(e) => set({ notes: e.target.value })}
          error={fieldErrors.notes}
          disabled={pending}
        />
      </form>
    </Dialog>
  );
}
