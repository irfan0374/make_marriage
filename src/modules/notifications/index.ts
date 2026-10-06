import 'server-only';

// Public API of the notifications module.
export { sendEmail } from './notifications.service';
export type { EmailMessage } from './notifications.service';
export { notificationsCollectionSpecs } from './notifications.indexes';
