'use client';

import { Info } from 'lucide-react';
import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  useEmailPreview,
  useSendEmails,
  useSendTestInvitation,
  type EmailRequest,
} from '@/features/invitations/hooks';
import type { SendResult } from '@/modules/invitations/invitations.types';
import { ApiError } from '@/shared/api-client';

// "Send invitations" / "Remind families" confirmation (PRD INV-7, INV-18): who gets the email,
// who is skipped and why, how long it takes at the daily email limit, and a test first.

const families = (n: number) => `${n} ${n === 1 ? 'family' : 'families'}`;

function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVITATION_NOT_READY') {
      return 'Add an invitation card or message before sending.';
    }
    if (error.code === 'RSVP_CLOSED') return 'Replies are closed, so reminders can’t be sent.';
    return error.message;
  }
  return 'Could not reach the server. Check your connection and try again.';
}

function skippedLines(result: SendResult, kind: 'invite' | 'remind'): string[] {
  return [
    result.skippedNoEmail > 0 &&
      `${families(result.skippedNoEmail)} without an email: share their link on WhatsApp`,
    result.skippedNoEvents > 0 && `${families(result.skippedNoEvents)} not invited to any event`,
    result.skippedAlreadySent > 0 && `${families(result.skippedAlreadySent)} already sent`,
    result.skippedQueued > 0 && `${families(result.skippedQueued)} already being sent`,
    result.skippedNotNeeded > 0 &&
      (kind === 'remind'
        ? `${families(result.skippedNotNeeded)} replied already, turned reminders off or weren’t sent the invitation`
        : `${families(result.skippedNotNeeded)} not needed`),
  ].filter((line): line is string => Boolean(line));
}

export function SendDialog({
  weddingId,
  request: initialRequest,
  title,
  onClose,
  onSent,
}: {
  weddingId: string;
  request: EmailRequest;
  title: string;
  onClose: () => void;
  onSent?: (result: SendResult) => void;
}) {
  const [request, setRequest] = useState(initialRequest);
  const preview = useEmailPreview(weddingId, request);
  const send = useSendEmails(weddingId);
  const test = useSendTestInvitation(weddingId);
  const result = preview.data;
  const count = result?.queued ?? 0;
  const invite = request.kind === 'invite';
  // Selected families already sent can be included on purpose ("Resend").
  const canResend =
    request.kind === 'invite' &&
    'householdIds' in request.input &&
    (result?.skippedAlreadySent ?? 0) > 0;
  const resend =
    request.kind === 'invite' && 'resend' in request.input ? request.input.resend : false;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={
        invite
          ? 'Each family gets the invitation by email with their own link to reply.'
          : 'Families who haven’t answered every event get a gentle reminder with their link.'
      }
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-11 px-6"
            disabled={!result || count === 0 || send.isPending}
            onClick={() =>
              send.mutate(request, {
                onSuccess: (sent) => {
                  onSent?.(sent);
                  onClose();
                },
              })
            }
          >
            {send.isPending
              ? 'Sending…'
              : count > 0
                ? `Send ${count} ${count === 1 ? 'email' : 'emails'}`
                : 'Nothing to send'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormAlert
          message={
            preview.error ? messageOf(preview.error) : send.error ? messageOf(send.error) : null
          }
        />
        {preview.isPending ? (
          <p role="status" className="text-text-muted text-sm">
            Checking who can get it…
          </p>
        ) : result ? (
          <>
            <p className="bg-background rounded-card p-4">
              <span className="font-heading block text-3xl">{count}</span>
              <span className="text-text-muted text-sm">
                {count === 1 ? 'family will get the email' : 'families will get the email'}
              </span>
            </p>
            {skippedLines(result, request.kind).length > 0 && (
              <div>
                <p className="text-sm font-medium">Not included</p>
                <ul className="text-text-muted mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {skippedLines(result, request.kind).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            {canResend && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={resend}
                  onChange={(e) =>
                    request.kind === 'invite' &&
                    'householdIds' in request.input &&
                    setRequest({
                      kind: 'invite',
                      input: { ...request.input, resend: e.target.checked },
                    })
                  }
                  className="accent-primary size-4"
                />
                Send again to families already sent
              </label>
            )}
            {count > 0 && (
              <p className="text-text-muted flex gap-2 text-sm">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                {result.estimatedDays <= 1
                  ? 'Emails go out a few every minute, starting now. You can cancel while they’re going.'
                  : `Because of the daily email limit, this takes about ${result.estimatedDays} days. Emails go out a few every minute until the day’s limit, then continue the next day.`}
              </p>
            )}
            {invite && (
              <p className="text-sm">
                <button
                  type="button"
                  disabled={test.isPending}
                  onClick={() => test.mutate()}
                  className="text-primary font-medium underline underline-offset-4 hover:no-underline"
                >
                  {test.isPending ? 'Sending test…' : 'Send a test to myself first'}
                </button>
                {test.isSuccess && (
                  <span role="status" className="text-success-text ml-2">
                    Test sent.
                  </span>
                )}
                {test.isError && (
                  <span role="alert" className="text-danger-text ml-2">
                    {messageOf(test.error)}
                  </span>
                )}
              </p>
            )}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
