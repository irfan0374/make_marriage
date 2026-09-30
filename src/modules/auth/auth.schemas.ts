import { z } from 'zod';

// Client-safe: the sign-up and login forms validate with these same schemas (api-spec §5).

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email'));

export const passwordField = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');

export const nameField = z
  .string()
  .trim()
  .min(1, 'Enter your name')
  .max(80, 'Use at most 80 characters');

export const signupSchema = z.strictObject({
  name: nameField,
  email: emailField,
  password: passwordField,
});

// Login doesn't re-apply password rules: an old password that no longer meets them must still work.
export const loginSchema = z.strictObject({
  email: emailField,
  password: z.string().min(1, 'Enter your password').max(128, 'Use at most 128 characters'),
});

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

export const meSchema = z.object({
  user: publicUserSchema,
  // Filled in by the weddings module; empty until it exists.
  weddings: z.array(z.unknown()),
});
