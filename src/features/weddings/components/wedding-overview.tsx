'use client';

import { CalendarDays, Check, Mail, MapPin, UserPlus, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { timezoneLabel } from '@/config/constants';
import { useWedding } from '@/features/weddings/hooks';
import type { Wedding } from '@/modules/weddings/weddings.types';
import { ApiError } from '@/shared/api-client';
import { daysUntil, formatDate, formatLongDate } from '@/shared/dates';
import { RoleBadge } from './role-badge';

// The wedding's home page until the Phase 2 dashboard. Built from the Stitch
// "Wedding overview" screen.

const SETUP_STEPS = [
  {
    icon: CalendarDays,
    title: 'Add your events',
    description: 'Mehendi, Haldi, Sangeet, Wedding, Reception or your own.',
  },
  {
    icon: Users,
    title: 'Add guest families',
    description: 'Add families one by one or import a spreadsheet.',
  },
  {
    icon: Mail,
    title: 'Upload your invitation',
    description: 'Your invite image or video, and a message for guests.',
  },
  {
    icon: UserPlus,
    title: 'Invite your family',
    description: 'Give your partner, parents and siblings access.',
  },
] as const;

const card = 'border-border bg-surface rounded-card border';

function Countdown({ wedding }: { wedding: Wedding }) {
  const days = daysUntil(wedding.weddingDate, wedding.timezone);
  if (days < 0) return null;
  return (
    <div className="sm:border-border sm:border-l sm:pl-8 sm:text-right">
      {days === 0 ? (
        <p className="font-heading text-3xl">Today is the day</p>
      ) : (
        <>
          <p className="font-heading text-5xl leading-none">{days.toLocaleString('en-IN')}</p>
          <p className="text-text-muted mt-2 flex items-center gap-1.5 text-sm sm:justify-end">
            <span aria-hidden className="bg-gold size-1.5 rounded-full" />
            {days === 1 ? 'day to go' : 'days to go'}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * "Wedding details saved", after Settings sends the couple back here with `?saved=1`. The query
 * is removed straight away, so a reload or a shared link doesn't show it again.
 */
function SavedBanner({ weddingId, show }: { weddingId: string; show: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(show);
  useEffect(() => {
    if (show) router.replace(`/app/${weddingId}`, { scroll: false });
  }, [show, weddingId, router]);
  if (!visible) return null;
  return (
    <div
      role="status"
      className="bg-success-bg text-success-text rounded-input flex items-center gap-2 px-4 py-3 text-sm"
    >
      <Check aria-hidden className="size-4 shrink-0" />
      <span className="flex-1">Wedding details saved.</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="hover:bg-success-text/10 rounded-full p-1"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function WeddingOverview({
  weddingId,
  saved = false,
}: {
  weddingId: string;
  saved?: boolean;
}) {
  const { data: wedding, error, isPending, refetch } = useWedding(weddingId);

  if (isPending) {
    return (
      <p role="status" className="text-text-muted py-20 text-center">
        Loading your wedding…
      </p>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div role="alert" className="space-y-3 py-20 text-center">
        <h1 className="text-2xl">
          {notFound ? "We couldn't find this wedding" : "We couldn't load this wedding"}
        </h1>
        {notFound ? (
          <Link href="/app" className="text-primary font-medium hover:underline">
            Go to your weddings
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-primary font-medium hover:underline"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const details = [
    { label: 'Date', value: formatDate(wedding.weddingDate) },
    { label: 'City', value: wedding.city },
    ...(wedding.venue ? [{ label: 'Venue', value: wedding.venue }] : []),
    { label: 'Bride side / groom side', value: wedding.sidesEnabled ? 'On' : 'Off' },
    { label: 'Timezone', value: timezoneLabel(wedding.timezone) },
  ];

  return (
    <div className="space-y-10">
      <SavedBanner weddingId={weddingId} show={saved} />
      <section
        className={`${card} flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between md:p-8`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-text-muted text-xs font-medium tracking-[0.12em] uppercase">
              Your wedding
            </p>
            <RoleBadge role={wedding.me.role} />
          </div>
          <h1 className="mt-3 text-4xl break-words md:text-5xl">
            {wedding.brideName} &amp; {wedding.groomName}
          </h1>
          <p className="text-text-muted mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <CalendarDays aria-hidden className="text-primary size-4" />
              {formatLongDate(wedding.weddingDate)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin aria-hidden className="text-primary size-4" />
              {wedding.venue ? `${wedding.venue}, ${wedding.city}` : wedding.city}
            </span>
          </p>
        </div>
        <Countdown wedding={wedding} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section>
          <h2 className="text-2xl">Let&apos;s get your wedding ready</h2>
          <p className="text-text-muted mt-1 text-sm">
            A few steps to get started. You can do them in any order.
          </p>
          <div className={`${card} mt-5`}>
            <div className="border-border border-b px-5 py-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Getting started</span>
                <span className="text-text-muted">0 of {SETUP_STEPS.length} done</span>
              </div>
              <div
                className="bg-primary-tint mt-2 h-1.5 rounded-full"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={SETUP_STEPS.length}
                aria-valuenow={0}
                aria-label="Setup progress"
              />
            </div>
            <ul className="divide-border divide-y">
              {SETUP_STEPS.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-center gap-4 px-5 py-4">
                  <span className="bg-primary-tint text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-text-muted text-xs">{description}</p>
                  </div>
                  {/* These open once their features are built (events, guests, invitations, team). */}
                  <Button variant="outline" className="h-9 shrink-0 px-4" disabled>
                    Coming soon
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className={`${card} h-fit p-5`}>
          <h2 className="text-lg">Wedding details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {details.map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-text-muted">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {wedding.me.role === 'admin' && (
            <Link
              href={`/app/${wedding.id}/settings`}
              className={buttonVariants({ variant: 'outline', className: 'mt-5 h-9 w-full' })}
            >
              Edit details
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
