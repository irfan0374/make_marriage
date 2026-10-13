import 'server-only';

// Public API of the notifications module.
export {
  dailyEmailsLeft,
  DailyEmailLimitError,
  sendEmail,
  sendQueuedEmail,
} from './notifications.service';
export type { EmailMessage } from './notifications.service';
export { notificationsCollectionSpecs } from './notifications.indexes';
