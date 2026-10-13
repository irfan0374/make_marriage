'use client';

import { Check, Copy, Mail, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useMarkSent, useRegenerateLink } from '@/features/invitations/hooks';
import { SendDialog } from './send-dialog';
import type { Household } from '@/modules/households/households.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';

// A family's personal link in the Guests details panel (PRD INV-5, INV-8, INV-9): copy it,
// share it on WhatsApp, mark it as sent, or replace it with a new one.

const STATUS: Record<Household['inviteStatus'], string> = {
  not_sent: 'Not sent yet',
  queued: 'Sending…',
  sent: 'Sent by email',
  sent_manually: 'Shared by hand',
  failed: "Email couldn't be sent",
};

/** The message WhatsApp opens with; the couple can still edit it before sending. */
export function whatsAppUrl(household: Household, coupleNames: string): string {
  const text =
    `Dear ${household.displayName}, ${coupleNames} warmly invite you to their wedding. ` +
    `Please see your invitation and let us know if you can come: ${household.inviteLink}`;
  const phone = household.phone?.replace(/\D/g, '') ?? '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function RegenerateDialog({
  weddingId,
  household,
  onClose,
}: {
  weddingId: string;
  household: Household;
  onClose: () => void;
}) {
  const mutation = useRegenerateLink(weddingId);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Make a new link?"
      description={`The link you shared with ${household.displayName} will stop working straight away. Their replies are kept.`}
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Keep current link
          </Button>
          <Button
            className="h-11 px-6"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(household.id, { onSuccess: onClose })}
          >
            {mutation.isPending ? 'Making…' : 'Make new link'}
          </Button>
        </>
      }
    >
      {mutation.error && (
        <p role="alert" className="bg-danger-bg text-danger-text rounded-input px-4 py-3 text-sm">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'Could not reach the server. Check your connection and try again.'}
        </p>
      )}
    </Dialog>
  );
}

export function FamilyInvitation({
  weddingId,
  household,
  coupleNames,
  readOnly,
}: {
  weddingId: string;
  household: Household;
  coupleNames: string;
  readOnly: boolean;
}) {
  const markSent = useMarkSent(weddingId);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const sent = household.inviteStatus === 'sent' || household.inviteStatus === 'sent_manually';

  async function copy() {
    try {
      await navigator.clipboard.writeText(household.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const button =
    'border-border bg-surface hover:border-primary/40 flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold disabled:opacity-50';

  return (
    <section className="bg-background rounded-input space-y-3 p-4">
      <h3 className="text-text-muted flex items-center justify-between text-[11px] font-semibold tracking-[0.08em] uppercase">
        Invitation
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] tracking-normal normal-case',
            sent ? 'bg-success-bg text-success-text' : 'bg-pending-bg text-pending-text',
          )}
        >
          {STATUS[household.inviteStatus]}
          {household.openedAt && ' · Opened'}
        </span>
      </h3>
      <div className="flex gap-2">
        <input
          readOnly
          aria-label="Personal invitation link"
          value={household.inviteLink}
          onFocus={(e) => e.currentTarget.select()}
          className="border-border bg-surface rounded-input text-text-muted h-9 min-w-0 flex-1 border px-3 text-xs"
        />
        <button type="button" onClick={() => void copy()} className={button}>
          {copied ? (
            <Check aria-hidden className="size-3.5" />
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? 'Link copied' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {household.email && household.invitedEvents.length > 0 && (
          <button
            type="button"
            disabled={readOnly || household.inviteStatus === 'queued'}
            onClick={() => setEmailing(true)}
            className={button}
          >
            <Mail aria-hidden className="size-3.5" />
            {household.inviteStatus === 'queued'
              ? 'Email on its way'
              : sent
                ? 'Resend email'
                : household.inviteStatus === 'failed'
                  ? 'Try email again'
                  : 'Send by email'}
          </button>
        )}
        <a
          href={whatsAppUrl(household, coupleNames)}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          <MessageCircle aria-hidden className="size-3.5" />
          Share on WhatsApp
        </a>
        {!sent && (
          <button
            type="button"
            disabled={readOnly || markSent.isPending}
            onClick={() => markSent.mutate(household.id)}
            className={button}
          >
            <Send aria-hidden className="size-3.5" />
            {markSent.isPending ? 'Saving…' : 'Mark as sent'}
          </button>
        )}
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setRegenerating(true)}
          className={cn(button, 'text-text-muted')}
        >
          <RefreshCw aria-hidden className="size-3.5" />
          New link
        </button>
      </div>
      {markSent.error && (
        <p role="alert" className="text-danger-text text-xs">
          {markSent.error instanceof ApiError
            ? markSent.error.message
            : 'Could not save. Try again.'}
        </p>
      )}
      {!sent && (
        <p className="text-text-muted text-xs">
          Shared it yourself? Mark it as sent so it&apos;s counted.
        </p>
      )}
      {household.emailBounced && (
        <p className="text-danger-text text-xs">
          Emails to {household.email} bounced. Check the address or share the link on WhatsApp.
        </p>
      )}
      {emailing && (
        <SendDialog
          weddingId={weddingId}
          title={`Email the invitation to ${household.displayName}`}
          request={{
            kind: 'invite',
            input: { householdIds: [household.id], resend: sent, dryRun: false },
          }}
          onClose={() => setEmailing(false)}
        />
      )}
      {regenerating && (
        <RegenerateDialog
          weddingId={weddingId}
          household={household}
          onClose={() => setRegenerating(false)}
        />
      )}
    </section>
  );
}
