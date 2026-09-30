'use client';

import { useRef, useState } from 'react';
import type { z } from 'zod';
import { ApiError } from '@/shared/api-client';
import type { ErrorCode } from '@/shared/error-codes';

type Errors = Record<string, string>;

/**
 * Form state for the auth forms: validates with the shared Zod schema before sending, and maps
 * API errors back onto fields (`fieldFor`) or a message above the form. Attach `formRef` to the
 * form so the first field with an error gets focus.
 */
export function useAuthForm<S extends z.ZodType>(
  schema: S,
  fieldFor: Partial<Record<ErrorCode, string>> = {},
) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function showFieldErrors(errors: Errors) {
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    const field = first ? formRef.current?.elements.namedItem(first) : null;
    if (field instanceof HTMLElement) field.focus();
  }

  function validate(values: Record<string, FormDataEntryValue | null>): z.output<S> | null {
    setFormError(null);
    const result = schema.safeParse(values);
    if (result.success) {
      setFieldErrors({});
      return result.data;
    }
    // Issues come in schema order, which matches the order of the fields on the form.
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

  return { formRef, fieldErrors, formError, validate, showError };
}
