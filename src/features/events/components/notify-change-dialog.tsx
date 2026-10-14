'use client';

import { useEffect } from 'react';
import { SendDialog } from '@/features/invitations/components/send-dialog';
import { useEmailPreview } from '@/features/invitations/hooks';
import type { WeddingEvent } from '@/modules/events/events.types';

// "Let families know?" after an event's date, time or place changes (api-spec §8.4, §10.8).
// It only appears when some family would actually get the email.

export function NotifyChangeDialog({
  weddingId,
  event,
  onClose,
}: {
  weddingId: string;
  event: WeddingEvent;
  onClose: () => void;
}) {
  const request = { kind: 'update' as const, eventId: event.id, input: { dryRun: false } };
  const preview = useEmailPreview(weddingId, request);
  // Only a successful check that finds nobody (not sent yet, no emails) closes it: if the check
  // itself failed, the dialog shows the problem with Try again instead of silently going away.
  const nobody = preview.isSuccess && preview.data.queued === 0;

  useEffect(() => {
    if (nobody) onClose();
  }, [nobody, onClose]);

  if (preview.isPending || nobody) return null;
  return (
    <SendDialog
      weddingId={weddingId}
      request={request}
      title="Let families know?"
      description={`You changed when or where ${event.name} is. Families invited to it who were sent the invitation can get an email with the latest details.`}
      cancelLabel="Not now"
      onClose={onClose}
    />
  );
}
