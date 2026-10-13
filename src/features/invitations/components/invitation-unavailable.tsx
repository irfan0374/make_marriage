import { LinkIcon } from 'lucide-react';

// The guest page when the link can't be shown (PRD INV-13): an unknown or regenerated link, or
// too many visits in a minute.

export function InvitationUnavailable({ reason }: { reason: 'invalid' | 'busy' }) {
  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4">
      <div className="bg-surface border-border/70 rounded-card shadow-card max-w-md border px-8 py-12 text-center">
        <span className="bg-primary-tint text-primary mx-auto flex size-14 items-center justify-center rounded-full">
          <LinkIcon aria-hidden className="size-6" />
        </span>
        {reason === 'invalid' ? (
          <>
            <h1 className="mt-6 text-3xl font-normal">This link isn&apos;t working</h1>
            <p className="text-text-muted mt-3">
              The invitation link may have been changed or typed incorrectly. Please ask the family
              who invited you to send it again.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-3xl font-normal">Please wait a moment</h1>
            <p className="text-text-muted mt-3">
              This invitation was opened many times in the last minute. Please try again shortly.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
