import 'server-only';
import { ObjectId } from 'mongodb';

/**
 * A wedding id that has been checked: the caller is a member of this wedding, or it was
 * resolved from a valid guest or gallery token. Tenant repositories only accept this type,
 * so a raw id from a URL can't reach the database unchecked.
 */
export type WeddingId = ObjectId & { readonly __brand: 'WeddingId' };

/**
 * Mark an id as a verified tenant. Call this ONLY in the wedding-context resolver (after the
 * membership check), in guest/gallery token lookups, when creating a wedding, and in tests.
 */
export function trustWeddingId(id: ObjectId): WeddingId {
  return id as WeddingId;
}

/** Convert a hex id that has already passed `objectIdString` validation. */
export function toObjectId(hex: string): ObjectId {
  return ObjectId.createFromHexString(hex);
}
