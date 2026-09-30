import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/** Unguessable URL-safe token (256 bits by default) for sessions and reset links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex. Session and reset tokens are stored only in this form (database-design §6.2). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
