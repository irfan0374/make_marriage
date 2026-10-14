import 'server-only';
import type { ClientSession, ObjectId } from 'mongodb';
import type { WeddingId } from '@/lib/ids';
import { findAuditLogs, insertAuditLogs } from './audit.repository';
import type { AuditEntry } from './audit.types';

// The audit log (architecture §12, database-design §7.13): who changed something sensitive and
// when. Callers record inside their own transaction, so a change and its record land together.

export function recordAudit(
  weddingId: WeddingId,
  entries: AuditEntry | AuditEntry[],
  session?: ClientSession,
  now = new Date(),
): Promise<void> {
  return insertAuditLogs(weddingId, Array.isArray(entries) ? entries : [entries], now, session);
}

export function auditHistory(weddingId: WeddingId, targetId: ObjectId) {
  return findAuditLogs(weddingId, targetId);
}
