import 'server-only';

// Public API of the audit module: the activity record (database-design §7.13).
export { auditCollectionSpecs } from './audit.indexes';
export { auditHistory, recordAudit } from './audit.service';
export type { AuditAction, AuditActor, AuditEntry } from './audit.types';
