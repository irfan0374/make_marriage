'use client';

import { FileText, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { FormAlert, FormField, FormSelect, FormTextarea } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { receiptUrl } from '@/features/expenses/api';
import { useCreateExpense, useDeleteExpense, useUpdateExpense } from '@/features/expenses/hooks';
import { fileCheck, uploadFile } from '@/features/files/upload';
import type { WeddingEvent } from '@/modules/events/events.types';
import {
  categoryLabel,
  createExpenseSchema,
  DESCRIPTION_MAX,
  EXPENSE_NOTES_MAX,
  PAYER_NAME_MAX,
  PRESET_CATEGORIES,
} from '@/modules/expenses/expenses.schemas';
import type { Expense, UpdateExpenseInput } from '@/modules/expenses/expenses.types';
import { FILE_RULES } from '@/modules/files/files.schemas';
import type { TeamMember } from '@/modules/team/team.types';
import type { Vendor } from '@/modules/vendors/vendors.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { parseRupees, rupeesInput } from '@/shared/money';

// "Add expense" / "Edit expense" (Stitch "Expenses"): beside the list on desktop, a full-screen
// sheet on phones and tablets. Amounts are typed in rupees and saved in paise.

export type ExpensePanelMode = { kind: 'new' } | { kind: 'edit'; expense: Expense };

/** "Someone else" in the Paid by list: type a name (e.g. Papa). */
const OTHER = '__other__';

interface Values {
  amount: string;
  date: string;
  category: string;
  description: string;
  eventId: string;
  vendorId: string;
  /** A member's user id, or OTHER. */
  payer: string;
  payerName: string;
  notes: string;
  /** The receipt as saved or just uploaded; `null` for none. */
  receipt: { key: string | null; fileName: string; contentType: string } | null;
}

function initialValues(mode: ExpensePanelMode, today: string, myUserId: string): Values {
  if (mode.kind === 'edit') {
    const e = mode.expense;
    return {
      amount: rupeesInput(e.amountPaise),
      date: e.date,
      category: e.category,
      description: e.description,
      eventId: e.eventId ?? '',
      vendorId: e.vendor?.id ?? '',
      payer: e.paidBy.type === 'member' ? e.paidBy.userId : OTHER,
      payerName: e.paidBy.type === 'name' ? e.paidBy.name : '',
      notes: e.notes,
      // `key: null` means "the saved receipt": it isn't sent again unless it changes.
      receipt: e.receipt ? { key: null, ...e.receipt } : null,
    };
  }
  return {
    amount: '',
    date: today,
    category: '',
    description: '',
    eventId: '',
    vendorId: '',
    payer: myUserId,
    payerName: '',
    notes: '',
    receipt: null,
  };
}

function DeleteExpenseDialog({
  weddingId,
  expense,
  onClose,
  onDeleted,
}: {
  weddingId: string;
  expense: Expense;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteExpense(weddingId);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Delete this expense?"
      description={`${expense.description}${expense.receipt ? ' · its receipt will be deleted too' : ''}`}
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Keep expense
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-6"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(expense.id, { onSuccess: onDeleted })}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete expense'}
          </Button>
        </>
      }
    >
      <FormAlert
        message={
          mutation.error
            ? mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Could not reach the server. Check your connection and try again.'
            : null
        }
      />
    </Dialog>
  );
}

export function ExpensePanel({
  weddingId,
  mode,
  today,
  myUserId,
  members,
  events,
  vendors,
  customCategories,
  readOnly,
  onClose,
}: {
  weddingId: string;
  mode: ExpensePanelMode;
  today: string;
  myUserId: string;
  members: TeamMember[];
  events: WeddingEvent[];
  vendors: Vendor[];
  customCategories: string[];
  readOnly: boolean;
  onClose: () => void;
}) {
  // The values the panel opened with; an edit sends only what changed from these.
  const [saved] = useState(() => initialValues(mode, today, myUserId));
  const [values, setValues] = useState(saved);
  const create = useCreateExpense(weddingId);
  const update = useUpdateExpense(weddingId);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending || uploading;
  const { formRef, fieldErrors, formError, validate, showError, onInput } =
    useForm(createExpenseSchema);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  useEffect(() => panelRef.current?.focus({ preventScroll: true }), []);

  async function chooseReceipt(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setReceiptError(null);
    const problem = await fileCheck('receipt', file);
    if (problem) {
      setReceiptError(problem);
      return;
    }
    setUploading(true);
    try {
      const key = await uploadFile(weddingId, 'receipt', file);
      set({ receipt: { key, fileName: file.name, contentType: file.type } });
    } catch (error) {
      setReceiptError(
        error instanceof ApiError ? error.message : "The receipt couldn't be uploaded. Try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    // Every field is checked at once; a missing or unreadable amount is reported with the rest.
    const amountPaise = parseRupees(values.amount);
    const amountProblem =
      values.amount.trim() === ''
        ? 'Enter the amount'
        : amountPaise === null
          ? 'Enter an amount like 50,000'
          : null;
    const savedReceipt = mode.kind === 'edit' ? mode.expense.receipt : null;
    const input = validate({
      amountPaise: amountPaise ?? 0,
      date: values.date,
      category: values.category,
      description: values.description,
      eventId: values.eventId,
      vendorId: values.vendorId,
      paidBy:
        values.payer === OTHER
          ? { type: 'name', name: values.payerName }
          : { type: 'member', userId: values.payer },
      notes: values.notes,
      receipt:
        values.receipt?.key != null
          ? { key: values.receipt.key, fileName: values.receipt.fileName }
          : null,
    });
    setAmountError(amountProblem);
    if (!input || amountProblem) return;
    if (mode.kind === 'new') {
      create.mutate(input, { onSuccess: onClose, onError: showError });
      return;
    }
    // Only what changed: an untouched payer who has left the team, or a vendor deleted since,
    // stays exactly as saved.
    const patch: UpdateExpenseInput = {};
    if (input.amountPaise !== mode.expense.amountPaise) patch.amountPaise = input.amountPaise;
    if (values.date !== saved.date) patch.date = input.date;
    if (values.category !== saved.category) patch.category = input.category;
    if (values.description.trim() !== saved.description) patch.description = input.description;
    if (values.eventId !== saved.eventId) patch.eventId = input.eventId;
    if (values.vendorId !== saved.vendorId) patch.vendorId = input.vendorId;
    if (values.payer !== saved.payer || values.payerName.trim() !== saved.payerName) {
      patch.paidBy = input.paidBy;
    }
    if (values.notes.trim() !== saved.notes) patch.notes = input.notes;
    // Leave the saved receipt alone unless it was replaced or removed.
    if (values.receipt?.key != null) patch.receipt = input.receipt;
    else if (!values.receipt && savedReceipt) patch.receipt = null;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    update.mutate(
      { id: mode.expense.id, input: patch },
      { onSuccess: onClose, onError: showError },
    );
  }

  const categoryOptions = [
    { value: '', label: 'Choose a category' },
    ...PRESET_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) })),
    ...customCategories.map((c) => ({ value: c, label: c })),
    // A category removed from the list since still shows on the expense that uses it.
    ...(values.category &&
    !(PRESET_CATEGORIES as readonly string[]).includes(values.category) &&
    !customCategories.includes(values.category)
      ? [{ value: values.category, label: values.category }]
      : []),
  ];

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className={cn(
        'bg-surface flex flex-col outline-none',
        'max-lg:fixed max-lg:inset-0 max-lg:z-50',
        'lg:border-border lg:rounded-card lg:shadow-card lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-hidden lg:border',
      )}
    >
      <div className="border-border/60 flex items-start justify-between gap-3 border-b px-6 py-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-2xl font-normal">
            {readOnly ? 'Expense' : mode.kind === 'new' ? 'Add expense' : 'Edit expense'}
          </h2>
          {mode.kind === 'new' && (
            <p className="text-text-muted mt-1 text-xs">Record a payment and who made it.</p>
          )}
        </div>
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
        <fieldset disabled={readOnly} className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <FormAlert message={formError} />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Amount (₹) *"
              name="amountPaise"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 50,000"
              value={values.amount}
              onChange={(e) => set({ amount: e.target.value })}
              error={amountError ?? fieldErrors.amountPaise}
            />
            <FormField
              label="Date *"
              name="date"
              type="date"
              value={values.date}
              onChange={(e) => set({ date: e.target.value })}
              error={fieldErrors.date}
            />
          </div>
          <FormSelect
            label="Category *"
            name="category"
            options={categoryOptions}
            value={values.category}
            onChange={(e) => set({ category: e.target.value })}
            error={fieldErrors.category}
          />
          <FormField
            label="Description *"
            name="description"
            autoComplete="off"
            maxLength={DESCRIPTION_MAX}
            placeholder="e.g. Mandap floral installation deposit"
            value={values.description}
            onChange={(e) => set({ description: e.target.value })}
            error={fieldErrors.description}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormSelect
              label="Event"
              name="eventId"
              options={[
                { value: '', label: 'General (no event)' },
                ...events.map((e) => ({ value: e.id, label: e.name })),
              ]}
              value={values.eventId}
              onChange={(e) => set({ eventId: e.target.value })}
              error={fieldErrors.eventId}
            />
            <FormSelect
              label="Vendor"
              name="vendorId"
              options={[
                {
                  value: '',
                  // A vendor deleted since keeps its name on the expense.
                  label:
                    mode.kind === 'edit' && mode.expense.vendor && !mode.expense.vendor.id
                      ? `${mode.expense.vendor.name} (deleted)`
                      : vendors.length
                        ? 'No vendor'
                        : 'No vendors saved yet',
                },
                ...vendors.map((v) => ({ value: v.id, label: v.name })),
              ]}
              value={values.vendorId}
              onChange={(e) => set({ vendorId: e.target.value })}
              error={fieldErrors.vendorId}
            />
          </div>
          <FormSelect
            label="Paid by"
            name="paidBy"
            options={[
              ...members.map((m) => ({ value: m.user.id, label: m.user.name })),
              // Someone who has since left the team still shows on their expense.
              ...(mode.kind === 'edit' &&
              mode.expense.paidBy.type === 'member' &&
              !members.some((m) => m.user.id === saved.payer)
                ? [{ value: saved.payer, label: mode.expense.paidBy.name }]
                : []),
              { value: OTHER, label: 'Someone else…' },
            ]}
            value={values.payer}
            onChange={(e) => set({ payer: e.target.value })}
            error={values.payer === OTHER ? undefined : fieldErrors.paidBy}
          />
          {values.payer === OTHER && (
            <FormField
              label="Who paid? *"
              name="payerName"
              autoComplete="off"
              maxLength={PAYER_NAME_MAX}
              placeholder="e.g. Papa, Uncle Rajesh"
              value={values.payerName}
              onChange={(e) => set({ payerName: e.target.value })}
              error={fieldErrors.paidBy}
            />
          )}
          <FormTextarea
            label="Notes"
            name="notes"
            rows={3}
            maxLength={EXPENSE_NOTES_MAX}
            placeholder="Transaction reference, balance due date, or remarks"
            value={values.notes}
            onChange={(e) => set({ notes: e.target.value })}
            error={fieldErrors.notes}
          />

          <div>
            <p className="mb-1.5 text-sm font-medium">Receipt or invoice</p>
            <input
              ref={fileRef}
              type="file"
              accept={FILE_RULES.receipt.types.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void chooseReceipt(e.target.files?.[0])}
            />
            {values.receipt ? (
              <div className="bg-background rounded-input flex items-center gap-3 p-3">
                <FileText aria-hidden className="text-primary size-5 shrink-0" />
                {values.receipt.key === null && mode.kind === 'edit' ? (
                  <a
                    href={receiptUrl(weddingId, mode.expense.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {values.receipt.fileName}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {values.receipt.fileName}
                  </span>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => set({ receipt: null })}
                    aria-label="Remove receipt"
                    className="text-text-muted hover:text-danger-text rounded-full p-1.5"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </div>
            ) : (
              !readOnly && (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="border-border bg-background hover:border-primary/40 rounded-input flex w-full flex-col items-center gap-1 border border-dashed px-4 py-5 text-center"
                >
                  <Upload aria-hidden className="text-primary size-5" />
                  <span className="text-sm font-medium">
                    {uploading ? 'Uploading…' : 'Upload a receipt or invoice'}
                  </span>
                  <span className="text-text-muted text-xs">PDF, JPG, PNG or WebP up to 10 MB</span>
                </button>
              )
            )}
            {receiptError && <p className="text-danger-text mt-1.5 text-xs">{receiptError}</p>}
          </div>
        </fieldset>

        {!readOnly && (
          <div className="border-border/60 flex items-center justify-between gap-3 border-t px-6 py-4">
            {mode.kind === 'edit' ? (
              <button
                type="button"
                onClick={() => setDeleting(true)}
                disabled={pending}
                className="text-danger-text hover:bg-danger-bg -ml-2 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
              >
                <Trash2 aria-hidden className="size-4" />
                Delete
              </button>
            ) : (
              <Button type="button" variant="ghost" className="h-11 px-4" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button type="submit" className="h-11 px-6" disabled={pending}>
              {create.isPending || update.isPending
                ? 'Saving…'
                : mode.kind === 'new'
                  ? 'Save expense'
                  : 'Save changes'}
            </Button>
          </div>
        )}
      </form>
      {deleting && mode.kind === 'edit' && (
        <DeleteExpenseDialog
          weddingId={weddingId}
          expense={mode.expense}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
