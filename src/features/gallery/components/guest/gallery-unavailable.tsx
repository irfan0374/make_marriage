import { House, Link2Off, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

// Stitch "Guest Gallery States" (invalid link): an unknown or replaced link. It shows nothing
// about any wedding.

export function GalleryUnavailable() {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-6 py-16">
      <div className="border-border bg-surface rounded-card w-full max-w-md border p-10 text-center shadow-sm">
        <span className="bg-background border-border text-text-muted mx-auto mb-5 flex size-14 items-center justify-center rounded-full border">
          <Link2Off aria-hidden className="size-6" />
        </span>
        <h1 className="mb-2 text-2xl">This gallery link isn&apos;t working</h1>
        <p className="text-text-muted mb-6 text-sm leading-relaxed">
          Ask the couple for the latest link.
        </p>
        <p className="text-text-muted mb-6 flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheck aria-hidden className="text-gold-deep size-4" />
          Private and secure event space
        </p>
        <Link
          href="/"
          className="bg-background border-border text-primary hover:bg-background-alt inline-flex items-center gap-1.5 rounded-full border px-5 py-2.5 text-xs font-semibold transition-colors"
        >
          <House aria-hidden className="size-4" />
          Return home
        </Link>
      </div>
    </main>
  );
}
