'use client';

import { useRef, useState } from 'react';
import type { z } from 'zod';
import { ApiError } from '@/shared/api-client';
import type { ErrorCode } from '@/shared/error-codes';

type Errors = Record<string, string>;

/**
 * Form state for forms that post to the API: validates with the shared Zod schema before sending, and maps
 * API errors back onto fields (`fieldFor`) or a message above the form. Attach `formRef` and
 * `onInput` to the form: the first field with an error gets focus, and a field's error clears
 * as soon as it is edited.
 */
export function useForm<S extends z.ZodType>(
  schema: S,
  fieldFor: Partial<Record<ErrorCode, string>> = {},
) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function showFieldErrors(errors: Errors) {
    setFieldErrors(errors);
    // Focus the first field with an error in page order (errors from checks that span several
    // fields can arrive after the fields below them).
    const fields = Array.from(formRef.current?.elements ?? []);
    const first = fields.find((el) => 'name' in el && (el.name as string) in errors);
    if (first instanceof HTMLElement) first.focus();
  }

  function validate(values: object): z.output<S> | null {
    setFormError(null);
    const result = schema.safeParse(values);
    if (result.success) {
      setFieldErrors({});
      return result.data;
    }
    const errors: Errors = {};
    for (const issue of result.error.issues) errors[String(issue.path[0])] ??= issue.message;
    showFieldErrors(errors);
    return null;
  }

  function showError(error: unknown) {
    if (!(error instanceof ApiError)) {
      setFormError('Could not reach the server. Check your connection and try again.');
      return;
    }
    const field = fieldFor[error.code];
    if (field) {
      showFieldErrors({ [field]: error.message });
      return;
    }
    // Details for fields on this form go under those fields. Anything else (no details, or a
    // problem with the request as a whole) shows above the form, so there's always a message.
    const onForm = Object.entries(error.fieldErrors()).filter(
      ([path]) => path && formRef.current?.elements.namedItem(path),
    );
    if (onForm.length > 0) showFieldErrors(Object.fromEntries(onForm));
    else setFormError(error.message);
  }

  function onInput(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!('name' in target) || typeof target.name !== 'string') return;
    const name = target.name;
    if (!(name in fieldErrors)) return;
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[name];
      return next;
    });
  }

  return { formRef, fieldErrors, formError, validate, showError, onInput };
}
