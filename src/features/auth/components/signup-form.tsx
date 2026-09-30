'use client';

import { Button } from '@/components/ui/button';
import { useSignup } from '@/features/auth/hooks';
import { signupSchema } from '@/modules/auth/auth.schemas';
import { FormAlert, FormField } from './form-field';
import { useAuthForm } from './use-auth-form';

export function SignupForm() {
  const mutation = useSignup();
  const { fieldErrors, formError, validate, showError } = useAuthForm(signupSchema, {
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
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={formError} />
      <FormField
        label="Your name"
        name="name"
        autoComplete="name"
        placeholder="Irfan"
        error={fieldErrors.name}
      />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={fieldErrors.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={fieldErrors.password}
      />
      <Button type="submit" className="h-11 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
