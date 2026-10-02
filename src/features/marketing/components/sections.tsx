import Link from 'next/link';
import { ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Logo } from '@/components/common/logo';
import { APP_NAME } from '@/config/app';
import { cn } from '@/shared/cn';
import {
  FEATURES,
  GUEST_POINTS,
  PRIVACY_POINTS,
  ROUTES,
  SECTION_IDS,
  STEPS,
} from '@/features/marketing/content';
import {
  DashboardMockup,
  InvitePhoneMockup,
  RsvpPhoneMockup,
} from '@/features/marketing/components/mockups';

const container = 'mx-auto w-full max-w-6xl px-5 md:px-8';
const primaryCta = cn(buttonVariants(), 'h-11 px-6');
const secondaryCta = cn(buttonVariants({ variant: 'secondary' }), 'h-11 px-6');

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-primary-tint text-primary inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
      <span aria-hidden className="bg-gold size-1.5 rounded-full" />
      {children}
    </span>
  );
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="bg-primary-tint text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
      <Icon aria-hidden className="size-5" />
    </span>
  );
}

export function MarketingHeader() {
  return (
    <header className="border-border bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
      <div className={cn(container, 'flex h-16 items-center justify-between gap-4')}>
        <div className="flex items-center gap-10">
          <Logo eager />
          <nav aria-label="Main" className="text-text-muted hidden gap-8 text-sm md:flex">
            <a href={`#${SECTION_IDS.features}`} className="hover:text-text">
              Features
            </a>
            <a href={`#${SECTION_IDS.howItWorks}`} className="hover:text-text">
              How it works
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={ROUTES.login}
            className={cn(buttonVariants({ variant: 'ghost' }), 'hidden h-9 px-4 sm:inline-flex')}
          >
            Log in
          </Link>
          <Link href={ROUTES.signup} className={cn(buttonVariants(), 'h-9 px-4')}>
            Start planning
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className={cn(container, 'grid items-center gap-12 py-16 md:py-24 lg:grid-cols-2')}>
      <div className="space-y-6">
        <Pill>Made for Indian weddings</Pill>
        <h1 className="text-4xl leading-tight tracking-tight md:text-6xl">
          Big wedding.
          <br />
          Calm planning.
        </h1>
        <p className="text-text-muted max-w-md text-lg">
          Events, guests, RSVPs and expenses, shared with your family in one place.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={ROUTES.signup} className={primaryCta}>
            Start planning
          </Link>
          <a href={`#${SECTION_IDS.sampleInvite}`} className={secondaryCta}>
            See a sample invite
          </a>
        </div>
        <ul className="text-text-muted flex flex-wrap gap-6 pt-2 text-sm">
          <li className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="text-primary size-4" />
            Private link for each family
          </li>
          <li className="flex items-center gap-2">
            <Smartphone aria-hidden className="text-primary size-4" />
            No app for guests
          </li>
        </ul>
      </div>

      <div className="relative mx-auto w-full max-w-md lg:max-w-none">
        <DashboardMockup className="lg:mr-16" />
        <InvitePhoneMockup className="mx-auto mt-8 w-64 lg:absolute lg:-right-2 lg:-bottom-12 lg:mt-0 lg:w-56" />
      </div>
    </section>
  );
}

export function FeatureGrid() {
  return (
    <section id={SECTION_IDS.features} className="bg-background-alt scroll-mt-16 py-20">
      <div className={container}>
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl text-balance md:text-4xl">Everything your shaadi needs</h2>
          <p className="text-text-muted mt-3">
            One shared plan for your events, your families and your spending.
          </p>
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="bg-surface border-border space-y-4 rounded-2xl border p-5 shadow-xs md:p-6"
            >
              <IconBadge icon={feature.icon} />
              <h3 className="text-xl">{feature.title}</h3>
              <p className="text-text-muted text-sm">{feature.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id={SECTION_IDS.howItWorks} className={cn(container, 'scroll-mt-16 py-20')}>
      <div className="text-center">
        <p className="text-text-muted text-xs font-medium tracking-[0.16em] uppercase">
          How it works
        </p>
        <h2 className="mt-3 text-3xl md:text-4xl">Three simple steps</h2>
      </div>
      <ol className="relative mt-14 grid gap-10 md:grid-cols-3">
        <span
          aria-hidden
          className="bg-border absolute top-4 right-[16.5%] left-[16.5%] hidden h-px md:block"
        />
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative text-center">
            <span className="bg-primary text-primary-foreground ring-background mx-auto flex size-8 items-center justify-center rounded-full text-sm font-medium ring-8">
              {index + 1}
            </span>
            <h3 className="mt-5 text-xl">{step.title}</h3>
            <p className="text-text-muted mx-auto mt-2 max-w-xs text-sm">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function GuestExperience() {
  return (
    <section id={SECTION_IDS.sampleInvite} className="bg-background-alt scroll-mt-16 py-20">
      <div className={cn(container, 'grid items-center gap-14 lg:grid-cols-2')}>
        <div className="space-y-6">
          <Pill>For your guests</Pill>
          <h2 className="text-3xl text-balance md:text-4xl xl:text-5xl">
            Your guests just tap a link
          </h2>
          <p className="text-text-muted max-w-md">
            No app and no sign-up. Families open their invite from WhatsApp or email and reply in
            seconds.
          </p>
          <ul className="space-y-3">
            {GUEST_POINTS.map((point) => (
              <li
                key={point.title}
                className="bg-surface border-border flex gap-4 rounded-2xl border p-4"
              >
                <IconBadge icon={point.icon} />
                <div>
                  <h3 className="font-sans text-sm font-medium">{point.title}</h3>
                  <p className="text-text-muted text-sm">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <RsvpPhoneMockup className="mx-auto w-full max-w-72" />
      </div>
    </section>
  );
}

export function Privacy() {
  return (
    <section className={cn(container, 'py-20')}>
      <ul className="bg-surface border-border grid gap-10 rounded-2xl border p-8 md:grid-cols-3 md:p-10">
        {PRIVACY_POINTS.map((point) => (
          <li key={point.title} className="space-y-3">
            <IconBadge icon={point.icon} />
            <h3 className="text-xl">{point.title}</h3>
            <p className="text-text-muted text-sm">{point.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className={cn(container, 'py-20 text-center')}>
      <span aria-hidden className="bg-gold mx-auto block size-1.5 rounded-full" />
      <h2 className="mt-6 text-3xl text-balance md:text-5xl">Start planning your wedding</h2>
      <p className="text-text-muted mt-3">
        Bring your events, families and spending into one plan.
      </p>
      <Link href={ROUTES.signup} className={cn(primaryCta, 'mt-8')}>
        Start planning
      </Link>
    </section>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-border bg-background-alt border-t">
      <div className={cn(container, 'flex flex-col gap-6 py-10 md:flex-row md:justify-between')}>
        <div className="space-y-2">
          <Logo />
          <p className="text-text-muted text-xs">
            © {new Date().getFullYear()} {APP_NAME}
          </p>
        </div>
        <nav aria-label="Footer" className="text-text-muted flex flex-wrap gap-6 text-sm">
          <a href={`#${SECTION_IDS.features}`} className="hover:text-text">
            Features
          </a>
          <a href={`#${SECTION_IDS.howItWorks}`} className="hover:text-text">
            How it works
          </a>
          <Link href={ROUTES.login} className="hover:text-text">
            Log in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
