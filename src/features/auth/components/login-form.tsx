'use client';

import { Button } from '@/components/ui/button';
import { useLogin } from '@/features/auth/hooks';
import { EMAIL_MAX, loginSchema, PASSWORD_MAX } from '@/modules/auth/auth.schemas';
import { FormAlert, FormField } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';

export function LoginForm() {
  const mutation = useLogin();
  const { formRef, fieldErrors, formError, validate, showError, onInput } = useForm(loginSchema);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = validate({ email: form.get('email'), password: form.get('password') });
    if (input) mutation.mutate(input, { onError: showError });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="space-y-5">
      <FormAlert message={formError} />
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
        autoComplete="current-password"
        maxLength={PASSWORD_MAX}
        error={fieldErrors.password}
      />
      <Button type="submit" className="h-11 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? 'Logging in…' : 'Log in'}
      </Button>
    </form>
  );
}
