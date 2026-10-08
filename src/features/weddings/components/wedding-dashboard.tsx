'use client';

import {
  CalendarDays,
  Check,
  ListChecks,
  ListTodo,
  QrCode,
  Receipt,
  Settings,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SoonTag } from '@/components/common/soon-tag';
import { useTeam } from '@/features/team/hooks';
import { useMe, useWedding } from '@/features/weddings/hooks';
import { firstName, greetingFor, setupSteps } from '@/features/weddings/setup-steps';
import type { Wedding } from '@/modules/weddings/weddings.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { daysUntil, formatDate } from '@/shared/dates';

// The wedding's dashboard, laid out as the Stitch "Dashboard" screen (PRD §5.5). Every number is
// real: until a feature exists its card shows zero or an empty state, never sample data. As
// events, guests and RSVP, tasks and expenses ship, their cards fill in.

const card = 'border-border bg-surface rounded-card shadow-card border';
const cardHeader = 'border-border/60 flex items-center justify-between gap-3 border-b pb-5';
const cardTitle = 'font-heading text-xl font-normal whitespace-nowrap';

const noSubscribe = () => () => {};

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
      className="bg-success-bg text-success-text rounded-input mb-6 flex items-center gap-2 px-4 py-3 text-sm"
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

/** Greeting on the left; countdown, date and city in a framed box on the right. */
function Welcome({ wedding, name }: { wedding: Wedding; name: string | undefined }) {
  // Time of day where the person is; empty on the server so the first render matches.
  const greeting = useSyncExternalStore(
    noSubscribe,
    () => greetingFor(new Date().getHours()),
    () => '',
  );
  const days = daysUntil(wedding.weddingDate, wedding.timezone);
  return (
    <header className="mb-7 flex flex-col justify-between gap-4 pt-2 md:flex-row md:items-end">
      <div className="min-w-0">
        <p className="text-pending-text mb-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
          Overview
        </p>
        <h1 className="text-3xl font-normal tracking-tight break-words lg:text-4xl">
          {greeting ? `${greeting}${name ? `, ${firstName(name)}` : ''}` : ' '}
        </h1>
      </div>
      <div
        className={cn(
          card,
          'flex items-center gap-4 px-4 py-3.5 sm:gap-5 sm:self-start sm:px-6 md:self-auto',
        )}
      >
        {days > 0 && (
          <>
            <p className="flex items-baseline gap-2">
              <span className="font-heading text-primary text-3xl leading-none tracking-tight lg:text-4xl">
                {days.toLocaleString('en-IN')}
              </span>
              <span className="text-text-muted text-xs font-medium tracking-wider whitespace-nowrap uppercase">
                {days === 1 ? 'day to go' : 'days to go'}
              </span>
            </p>
            <span aria-hidden className="bg-border h-8 w-px" />
          </>
        )}
        {days === 0 && (
          <>
            <p className="font-heading text-primary text-2xl leading-none">Today</p>
            <span aria-hidden className="bg-border h-8 w-px" />
          </>
        )}
        <p className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden className="bg-gold inline-block size-1.5 rounded-full" />
          <span>
            <span className="whitespace-nowrap">{formatDate(wedding.weddingDate)}</span>{' '}
            <span className="text-text-muted font-normal">·</span> {wedding.city}
          </span>
        </p>
      </div>
    </header>
  );
}

// The setup card can be closed; that's remembered per wedding in this browser only.
const dismissKey = (weddingId: string) => `setup-dismissed:${weddingId}`;
const dismissListeners = new Set<() => void>();
function subscribeDismiss(listener: () => void) {
  dismissListeners.add(listener);
  return () => dismissListeners.delete(listener);
}
function readDismissed(weddingId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(weddingId)) === '1';
  } catch {
    return false;
  }
}
function dismiss(weddingId: string) {
  try {
    localStorage.setItem(dismissKey(weddingId), '1');
  } catch {
    // Storage blocked: the card still hides until the page reloads.
  }
  hiddenThisVisit.add(weddingId);
  dismissListeners.forEach((listener) => listener());
}
const hiddenThisVisit = new Set<string>();

function SetupCard({ weddingId, teamSize }: { weddingId: string; teamSize: number }) {
  const dismissed = useSyncExternalStore(
    subscribeDismiss,
    () => hiddenThisVisit.has(weddingId) || readDismissed(weddingId),
    () => false,
  );
  const steps = setupSteps({ weddingId, teamSize });
  const done = steps.filter((s) => s.done).length;
  const percent = Math.round((done / steps.length) * 100);
  if (dismissed || done === steps.length) return null;

  const chip = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium';
  return (
    <section className={cn(card, 'mb-7 p-5')} aria-labelledby="setup-heading">
      <div className="border-border/60 flex flex-col justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <h2 id="setup-heading" className="font-sans text-sm font-semibold">
            Finish setting up
          </h2>
          <span className="text-text-muted text-xs font-medium">
            · {done} of {steps.length} done
          </span>
        </div>
        <div className="flex w-full items-center gap-4 sm:w-auto">
          <div className="flex flex-1 items-center gap-3 sm:w-48">
            <div
              className="bg-primary-tint h-1.5 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={done}
              aria-label="Setup progress"
            >
              <div className="bg-primary h-full rounded-full" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-primary text-xs font-semibold">{percent}%</span>
          </div>
          <button
            type="button"
            onClick={() => dismiss(weddingId)}
            aria-label="Dismiss setup checklist"
            title="Dismiss"
            className="text-text-muted hover:text-text hover:bg-background rounded-full p-1 transition"
          >
            <X aria-hidden className="size-4.5" />
          </button>
        </div>
      </div>
      <ul className="flex flex-wrap items-center gap-2.5 pt-4">
        {steps.map((step) => (
          <li key={step.key}>
            {step.done ? (
              <span className={cn(chip, 'bg-success-bg text-success-text')}>
                <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                {step.title}
                <span className="sr-only"> (done)</span>
              </span>
            ) : step.href ? (
              <Link
                href={step.href}
                className={cn(
                  chip,
                  'border-border bg-surface hover:border-primary hover:text-primary border transition',
                )}
              >
                <span
                  aria-hidden
                  className="inline-block size-3.5 rounded-full border border-current"
                />
                {step.title}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={cn(chip, 'border-border bg-surface cursor-default border')}
              >
                <span
                  aria-hidden
                  className="inline-block size-3.5 rounded-full border border-current opacity-50"
                />
                <span className="opacity-60">{step.title}</span>
                <SoonTag />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatCard({ label, value, footer }: { label: string; value: string; footer: string }) {
  return (
    <div className={cn(card, 'flex flex-col justify-between p-5')}>
      <div>
        <p className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
          {label}
        </p>
        <p className="font-heading text-3xl font-normal tracking-tight lg:text-[32px]">{value}</p>
      </div>
      <p className="border-border/40 text-text-muted mt-4 border-t pt-3 text-xs">{footer}</p>
    </div>
  );
}

/** "View all events →" in a card header; faded with "Soon" until that page exists. */
function ViewAll({ label }: { label: string }) {
  return (
    <span aria-disabled="true" className="relative shrink-0 cursor-default">
      <span className="text-primary text-xs font-semibold whitespace-nowrap opacity-50">
        {label}
      </span>
      <SoonTag className="absolute -top-4 -right-2" />
    </span>
  );
}

function DashCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn(card, 'p-6')}>
      <div className={cardHeader}>
        <h2 className={cardTitle}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="bg-background border-border text-primary rounded-input flex size-12 items-center justify-center border">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="text-text-muted max-w-xs text-sm">{text}</p>
    </div>
  );
}

function RsvpLegend() {
  const items = [
    { label: 'Attending', dot: 'bg-primary' },
    { label: 'Pending', dot: 'bg-primary-tint' },
    { label: 'Declined', dot: 'bg-text-muted/30' },
  ];
  return (
    <div className="text-text-muted flex items-center gap-4 text-xs font-medium">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 rounded-full', item.dot)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string | null;
  icon: LucideIcon;
  label: string;
}) {
  const base =
    'border-border bg-surface rounded-input flex items-center gap-2.5 border p-3 text-left text-sm font-medium';
  const icon = <Icon aria-hidden className="text-primary size-4.5 shrink-0" />;
  return href ? (
    <Link href={href} className={cn(base, 'hover:border-primary hover:bg-background transition')}>
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  ) : (
    <span aria-disabled="true" className={cn(base, 'relative cursor-default')}>
      <span className="opacity-50">{icon}</span>
      <span className="truncate opacity-60">{label}</span>
      <SoonTag className="border-border absolute -top-2 right-2 border" />
    </span>
  );
}

export function WeddingDashboard({
  weddingId,
  saved = false,
}: {
  weddingId: string;
  saved?: boolean;
}) {
  const { data: wedding, error, isPending, refetch } = useWedding(weddingId);
  const { data: team } = useTeam(weddingId);
  const { data: me } = useMe();

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

  const isAdmin = wedding.me.role === 'admin';
  const base = `/app/${weddingId}`;

  return (
    <div className="flex w-full flex-col pb-16">
      <SavedBanner weddingId={weddingId} show={saved} />
      <Welcome wedding={wedding} name={me?.user.name} />
      <SetupCard weddingId={weddingId} teamSize={team?.members.length ?? 1} />

      <section
        aria-label="Summary"
        className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard label="Families invited" value="0" footer="No guests added yet" />
        <StatCard label="Replied" value="0" footer="No invitations sent yet" />
        <StatCard label="Guests attending" value="0" footer="No replies yet" />
        <StatCard label="Total spent" value="₹0" footer="No expenses logged yet" />
      </section>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-12">
        <div className="flex flex-col gap-7 lg:col-span-7">
          <DashCard title="Upcoming events" action={<ViewAll label="View all events" />}>
            <EmptyState
              icon={CalendarDays}
              text="Your Mehendi, Haldi, Sangeet and wedding day will show here once you add events."
            />
          </DashCard>
          <DashCard title="RSVP by event" action={<RsvpLegend />}>
            <EmptyState
              icon={Users}
              text="Who's attending each event will show here once invitations go out."
            />
          </DashCard>
        </div>

        <div className="flex flex-col gap-7 lg:col-span-5">
          <DashCard title="Tasks due soon" action={<ViewAll label="View all tasks" />}>
            <EmptyState
              icon={ListTodo}
              text="Tasks that are overdue or due this week will show here."
            />
          </DashCard>
          <DashCard title="Spending by category" action={<ViewAll label="View expenses" />}>
            <EmptyState
              icon={Wallet}
              text="Spending on venue, catering, attire and more will show here."
            />
          </DashCard>
          <section aria-labelledby="actions-heading" className={cn(card, 'p-6')}>
            <h2
              id="actions-heading"
              className="text-text-muted mb-4 font-sans text-xs font-semibold tracking-wider uppercase"
            >
              Quick actions
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <QuickAction
                href={`${base}/team`}
                icon={UserPlus}
                label={isAdmin ? 'Invite family' : 'View team'}
              />
              {isAdmin && (
                <QuickAction href={`${base}/settings`} icon={Settings} label="Wedding details" />
              )}
              <QuickAction href={null} icon={Users} label="Add guests" />
              <QuickAction href={null} icon={Receipt} label="Add expense" />
              <QuickAction href={null} icon={ListChecks} label="Add task" />
              <QuickAction href={null} icon={QrCode} label="Share gallery QR" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
