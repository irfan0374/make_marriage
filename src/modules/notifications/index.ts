import 'server-only';

// Public API of the notifications module.
export {
  dailyEmailsLeft,
  DailyEmailLimitError,
  readResendWebhook,
  recordDeliveryEvent,
  sendEmail,
  sendQueuedEmail,
  verifyResendWebhook,
} from './notifications.service';
export type { DeliveryEvent, EmailMessage } from './notifications.service';
export { notificationsCollectionSpecs } from './notifications.indexes';
