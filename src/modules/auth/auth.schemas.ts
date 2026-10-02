import { z } from 'zod';

// Client-safe: the sign-up and login forms validate with these same schemas (api-spec §5).

export const EMAIL_MAX = 254;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 80;

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX, 'Email is too long')
  .pipe(z.email('Enter a valid email'));

export const passwordField = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`);

export const nameField = z
  .string()
  .trim()
  .min(1, 'Enter your name')
  .max(NAME_MAX, `Use at most ${NAME_MAX} characters`);

export const signupSchema = z.strictObject({
  name: nameField,
  email: emailField,
  password: passwordField,
});

// Login doesn't re-apply password rules: an old password that no longer meets them must still work.
export const loginSchema = z.strictObject({
  email: emailField,
  password: z
    .string()
    .min(1, 'Enter your password')
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`),
});

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});
