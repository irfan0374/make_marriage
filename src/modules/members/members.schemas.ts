import { z } from 'zod';

// Client-safe enums for team members (api-spec §4.11).

export const roleSchema = z.enum(['admin', 'manager']);
export const sideScopeSchema = z.enum(['bride', 'groom', 'both']);
