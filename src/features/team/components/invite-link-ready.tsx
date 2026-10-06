'use client';

import { Check, Copy, MessageCircle, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import type { InviteLink } from '@/modules/team/team.types';
import { cn } from '@/shared/cn';

/**
 * After inviting or getting a new link: the link, shown this once (only its hash is stored),
 * with Copy and Share on WhatsApp, and whether the email went out.
 */
export function InviteLinkReady({
  result,
  weddingName,
}: {
  result: InviteLink;
  weddingName: string;
}) {
  const [copied, setCopied] = useState(false);
  const whatsappText = `You're invited to help plan ${weddingName}'s wedding. Join here: ${result.inviteLink}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the link stays selectable in the box below.
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="bg-primary-tint text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
          <Check aria-hidden className="size-5" />
        </span>
        <p className="text-sm leading-relaxed" role="status">
          {result.emailSent ? (
            <>
              Invitation emailed to <strong>{result.invite.email}</strong>. You can also share the
              link yourself.
            </>
          ) : (
            <>
              We couldn&apos;t send the email to <strong>{result.invite.email}</strong>. Copy the
              link and share it yourself.
            </>
          )}{' '}
          It works for 7 days and only for that email.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="invite-link" className="text-sm font-medium">
          Invite link
        </label>
        <div className="flex gap-2">
          <input
            id="invite-link"
            readOnly
            value={result.inviteLink}
            onFocus={(event) => event.currentTarget.select()}
            className="border-border bg-background-alt rounded-input h-11 min-w-0 flex-1 border px-3 text-sm"
          />
          <Button type="button" className="h-11 shrink-0 px-5" onClick={() => void copy()}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      </div>

      <a
        href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full')}
      >
        <MessageCircle aria-hidden className="text-primary" />
        Share on WhatsApp
      </a>

      <p className="bg-pending-bg text-pending-text rounded-input flex gap-2 px-4 py-3 text-sm">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Copy it now. For security, this link won&apos;t be shown again. If it&apos;s lost, use
          &ldquo;Get new link&rdquo;.
        </span>
      </p>
    </div>
  );
}
