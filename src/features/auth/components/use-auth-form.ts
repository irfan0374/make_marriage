'use client';

import { useState } from 'react';
import type { z } from 'zod';
import { ApiError } from '@/shared/api-client';
import type { ErrorCode } from '@/shared/error-codes';

type Errors = Record<string, string>;

/**
 * Form state for the auth forms: validates with the shared Zod schema before sending, and maps
 * API errors back onto fields (`fieldFor`) or a message above the form.
 */
export function useAuthForm<S extends z.ZodType>(
  schema: S,
  fieldFor: Partial<Record<ErrorCode, string>> = {},
) {
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function validate(values: Record<string, FormDataEntryValue | null>): z.output<S> | null {
    setFormError(null);
    const result = schema.safeParse(values);
    if (result.success) {
      setFieldErrors({});
      return result.data;
    }
    const errors: Errors = {};
    for (const issue of result.error.issues) errors[String(issue.path[0])] ??= issue.message;
    setFieldErrors(errors);
    return null;
  }

  function showError(error: unknown) {
    if (!(error instanceof ApiError)) {
      setFormError('Could not reach the server. Check your connection and try again.');
      return;
    }
    const field = fieldFor[error.code];
    if (field) setFieldErrors({ [field]: error.message });
    else if (error.code === 'VALIDATION_ERROR') setFieldErrors(error.fieldErrors());
    else setFormError(error.message);
  }

  return { fieldErrors, formError, validate, showError };
}
