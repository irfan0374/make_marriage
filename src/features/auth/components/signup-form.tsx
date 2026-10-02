'use client';

import { Button } from '@/components/ui/button';
import { useSignup } from '@/features/auth/hooks';
import { EMAIL_MAX, NAME_MAX, PASSWORD_MAX, signupSchema } from '@/modules/auth/auth.schemas';
import { FormAlert, FormField } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';

export function SignupForm() {
  const mutation = useSignup();
  const { formRef, fieldErrors, formError, validate, showError, onInput } = useForm(signupSchema, {
    EMAIL_TAKEN: 'email',
    WEAK_PASSWORD: 'password',
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = validate({
      name: form.get('name'),
      email: form.get('email'),
      password: form.get('password'),
    });
    if (input) mutation.mutate(input, { onError: showError });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="space-y-5">
      <FormAlert message={formError} />
      <FormField
        label="Your name"
        name="name"
        autoComplete="name"
        maxLength={NAME_MAX}
        placeholder="e.g. Priya Sharma"
        error={fieldErrors.name}
      />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        maxLength={EMAIL_MAX}
        placeholder="you@example.com"
        error={fieldErrors.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        hint="At least 8 characters."
        error={fieldErrors.password}
      />
      <Button type="submit" className="h-11 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
