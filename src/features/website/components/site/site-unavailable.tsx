import Link from 'next/link';
import { APP_NAME } from '@/config/app';

// Stitch "Wedding Website - Not Available": an unknown or unpublished address (PRD WEB-4). It
// never says which, so a draft site can't be detected.

export function SiteUnavailable() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-between px-6 py-12 text-center">
      <div className="flex items-center justify-center opacity-40">
        <span className="bg-border h-px w-8" />
        <span className="bg-gold-deep mx-1 size-1.5 rounded-full" />
        <span className="bg-border h-px w-8" />
      </div>
      <div className="flex w-full max-w-[340px] flex-col items-center">
        <div className="relative mb-6 flex size-24 items-center justify-center">
          <div className="bg-background-alt absolute inset-0 rounded-full opacity-70 blur-xl" />
          <div className="bg-surface relative flex size-20 items-center justify-center rounded-full shadow-sm">
            <svg aria-hidden viewBox="0 0 48 48" className="text-primary size-10" fill="none">
              <circle cx="19" cy="24" r="9" stroke="currentColor" strokeWidth="1.5" />
              <circle
                cx="29"
                cy="24"
                r="9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-primary text-[28px] leading-9 font-normal tracking-tight">
          This website isn&apos;t available
        </h1>
        <p className="text-text-muted mt-1 max-w-[260px] leading-relaxed">
          Check the link with the couple
        </p>
        <Link
          href="/"
          className="bg-background-alt hover:bg-border mt-12 inline-flex h-11 items-center rounded-full px-6 text-sm font-medium transition-colors"
        >
          Return home
        </Link>
        <p className="text-text-muted mt-12 text-[11px] tracking-wide opacity-80">
          {APP_NAME} · Thoughtful wedding planning
        </p>
      </div>
      <p className="text-text-muted text-[11px] tracking-wider uppercase opacity-80">
        Made with {APP_NAME}
      </p>
    </div>
  );
}
