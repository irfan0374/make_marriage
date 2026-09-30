import Link from 'next/link';
import { Logo } from '@/components/common/logo';

// Split layout from the Stitch login design: plum story panel on desktop, form on the right.
// On phones only the form shows.

function SampleWeddingCard() {
  return (
    <div aria-hidden className="bg-surface text-text w-full max-w-sm rounded-2xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="font-heading text-lg">Nafiya &amp; Irfan</p>
        <span className="bg-gold size-1.5 rounded-full" />
        <p className="text-text-muted text-xs">14 Nov 2026 · Udaipur</p>
      </div>
      <p className="font-heading border-border mt-4 border-t pt-4 text-lg italic">
        “Two families, one plan.”
      </p>
      <div className="border-border text-text-muted mt-4 flex items-center justify-between border-t pt-4 text-xs">
        <span className="flex items-center gap-2">
          <span className="bg-gold size-1.5 rounded-full" />
          Mehendi, Sangeet and Wedding
        </span>
        <span className="text-text font-medium">46 days to go</span>
      </div>
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Line under the form, e.g. the link to the other auth page. */
  footer: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-2">
      <aside className="bg-primary text-primary-foreground hidden flex-col justify-between p-12 lg:flex">
        <p className="flex items-center gap-2 text-xs font-medium tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-gold size-1.5 rounded-full" />
          Plan together
        </p>
        <SampleWeddingCard />
        <div className="space-y-3">
          <p className="font-heading text-5xl leading-tight">
            Big wedding.
            <br />
            Calm planning.
          </p>
          <p className="text-primary-foreground/80">
            Plan every event with your family, in one place.
          </p>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-10 md:px-8">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <Logo height={40} eager />
          <h1 className="mt-8 text-3xl">{title}</h1>
          <p className="text-text-muted mt-2 text-sm">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="text-text-muted mt-6 text-center text-sm">{footer}</p>
        </div>
        <p className="text-text-muted mt-10 text-center text-xs">
          <Link href="/privacy" className="hover:text-text">
            Privacy
          </Link>
        </p>
      </main>
    </div>
  );
}
