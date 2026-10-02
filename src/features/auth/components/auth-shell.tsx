import Image from 'next/image';
import { Logo } from '@/components/common/logo';

// Split layout from the Stitch login design: wedding photo under a plum overlay on desktop,
// form on the right. On phones only the form shows (the photo is never downloaded there).

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
      <aside className="text-primary-foreground relative isolate hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Image
          src="/images/auth-couple.jpg"
          alt=""
          fill
          sizes="(min-width: 1024px) 50vw, 0px"
          className="-z-20 object-cover"
        />
        {/* Plum overlay keeps the white text readable over the photo. */}
        <div
          aria-hidden
          className="from-primary/75 to-primary/95 absolute inset-0 -z-10 bg-linear-to-b"
        />
        <p className="flex items-center gap-2 text-xs font-medium tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-gold size-1.5 rounded-full" />
          Collaborative workspace
        </p>
        <div className="space-y-3">
          <p className="font-heading text-5xl leading-tight">
            Big wedding.
            <br />
            Calm planning.
          </p>
          <p className="text-primary-foreground/85">
            Plan every event with your family, in one place.
          </p>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-10 md:px-8">
        <p className="text-text-muted hidden text-right text-xs tracking-[0.16em] uppercase lg:block">
          Secured session
        </p>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <Logo height={40} eager />
          <h1 className="mt-8 text-3xl">{title}</h1>
          <p className="text-text-muted mt-2 text-sm">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="text-text-muted mt-6 text-center text-sm">{footer}</p>
        </div>
      </main>
    </div>
  );
}
