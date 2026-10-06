import { z } from 'zod';
import { emailField } from '@/modules/auth/auth.schemas';
import { roleSchema, sideScopeSchema } from '@/modules/members/members.schemas';

// Client-safe: the invite and change-role forms validate with these (api-spec §7).

export const createInviteSchema = z.strictObject({
  email: emailField,
  role: roleSchema,
  // Ignored (always "both") for admins and while the wedding has sides turned off.
  sideScope: sideScopeSchema.default('both'),
});

export const changeMemberSchema = z
  .strictObject({
    role: roleSchema.optional(),
    sideScope: sideScopeSchema.optional(),
  })
  .refine((v) => v.role !== undefined || v.sideScope !== undefined, {
    message: 'Choose a role or side to change',
  });

/** The secret part of a `/join/{token}` link: 43 URL-safe characters (256 bits). */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
