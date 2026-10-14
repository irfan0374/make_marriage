import 'server-only';
import { ObjectId, type ClientSession } from 'mongodb';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import { AUDIT_LOGS } from './audit.indexes';
import type { AuditEntry, AuditLogDocument } from './audit.types';

const KEEP_MS = 2 * 365 * 24 * 60 * 60_000;

export async function insertAuditLogs(
  weddingId: WeddingId,
  entries: AuditEntry[],
  now: Date,
  session?: ClientSession,
): Promise<void> {
  if (entries.length === 0) return;
  await scopedCollection<AuditLogDocument>(AUDIT_LOGS, weddingId).insertMany(
    entries.map((entry) => ({
      _id: new ObjectId(),
      actor: entry.actor,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      meta: entry.meta ?? {},
      at: now,
      expiresAt: new Date(now.getTime() + KEEP_MS),
      schemaVersion: 1 as const,
    })),
    { session },
  );
}

/** A target's history, newest first (for tests and a later activity page). */
export function findAuditLogs(weddingId: WeddingId, targetId: ObjectId) {
  return scopedCollection<AuditLogDocument>(AUDIT_LOGS, weddingId)
    .find({ targetId }, { sort: { at: -1, _id: -1 }, limit: 50 })
    .toArray();
}
