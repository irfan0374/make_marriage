'use client';

import { Button } from '@/components/ui/button';
import { useLogin } from '@/features/auth/hooks';
import { loginSchema } from '@/modules/auth/auth.schemas';
import { FormAlert, FormField } from './form-field';
import { useAuthForm } from './use-auth-form';

export function LoginForm() {
  const mutation = useLogin();
  const { fieldErrors, formError, validate, showError } = useAuthForm(loginSchema);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = validate({ email: form.get('email'), password: form.get('password') });
    if (input) mutation.mutate(input, { onError: showError });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={formError} />
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
        autoComplete="current-password"
        error={fieldErrors.password}
      />
      <Button type="submit" className="h-11 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Logging in…' : 'Log in'}
      </Button>
    </form>
  );
}
