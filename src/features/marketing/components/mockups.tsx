import { CircleCheck, Minus, Plus, ReceiptText } from 'lucide-react';
import { cn } from '@/shared/cn';

// Static product previews for the homepage. Decorative only: hidden from assistive tech, and
// nothing in them is interactive. Sample data uses the formats from architecture §18.4.

const EVENTS = [
  { date: '14 Nov', name: 'Mehendi', guests: 140 },
  { date: '15 Nov', name: 'Sangeet', guests: 310 },
  { date: '16 Nov', name: 'Wedding', guests: 350 },
  { date: '17 Nov', name: 'Reception', guests: 420 },
];

const RSVP = [
  { label: 'Attending', percent: 67, className: 'bg-primary' },
  { label: 'Pending', percent: 18, className: 'bg-gold' },
  { label: 'Not attending', percent: 15, className: 'bg-border' },
];

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'border-text bg-surface rounded-[2.25rem] border-[6px] p-4 pt-3 shadow-xl',
        className,
      )}
    >
      <div className="bg-background-alt mx-auto mb-4 h-1.5 w-16 rounded-full" />
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-text-muted text-center text-[0.625rem] font-medium tracking-[0.16em] uppercase">
      {children}
    </p>
  );
}

export function DashboardMockup({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('bg-text rounded-2xl p-2 shadow-xl', className)}>
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <span className="bg-text-muted size-2 rounded-full" />
        <span className="bg-text-muted size-2 rounded-full" />
        <span className="bg-text-muted size-2 rounded-full" />
      </div>
      <div className="bg-background space-y-4 rounded-xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="font-heading text-lg">Nafiya &amp; Irfan</p>
              <span className="bg-primary-tint text-primary rounded-full px-2 py-0.5 text-[0.625rem] font-medium">
                48 days to go
              </span>
            </div>
            <p className="text-text-muted text-xs">Udaipur · 14–17 Nov 2026</p>
          </div>
          <div className="flex -space-x-2">
            {['RA', 'PS', '+3'].map((initials) => (
              <span
                key={initials}
                className="border-background bg-primary-tint text-primary flex size-7 items-center justify-center rounded-full border-2 text-[0.625rem] font-medium"
              >
                {initials}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-surface border-border rounded-xl border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-medium">RSVP summary</p>
            <p className="text-text-muted text-xs">210 of 312 families replied</p>
          </div>
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-full">
            {RSVP.map((part) => (
              <span
                key={part.label}
                className={part.className}
                style={{ width: `${part.percent}%` }}
              />
            ))}
          </div>
          <div className="text-text-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem]">
            {RSVP.map((part) => (
              <span key={part.label} className="flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', part.className)} />
                {part.label} {part.percent}%
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EVENTS.map((event) => (
            <div
              key={event.name}
              className="bg-surface border-border rounded-xl border p-3 text-center"
            >
              <p className="text-text-muted text-[0.625rem] uppercase">{event.date}</p>
              <p className="mt-1 text-sm font-medium">{event.name}</p>
              <p className="text-text-muted text-[0.625rem]">{event.guests} guests</p>
            </div>
          ))}
        </div>

        <div className="bg-surface border-border flex items-center justify-between rounded-xl border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ReceiptText className="text-primary size-4" />
            Expenses
          </p>
          <p className="text-text-muted text-xs">
            Spent so far <span className="text-text font-medium">₹29,20,000</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function InvitePhoneMockup({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <PhoneFrame>
        <Eyebrow>Personal invite</Eyebrow>
        <p className="font-heading mt-2 text-center text-lg">Sharma family</p>
        <p className="text-text-muted text-center text-xs">Nafiya &amp; Irfan invite you</p>
        <div className="bg-background border-border mt-4 rounded-xl border p-3">
          <div className="flex justify-between text-sm font-medium">
            <span>Sangeet</span>
            <span className="text-text-muted text-xs font-normal">15 Nov</span>
          </div>
          <p className="text-text-muted text-xs">Trident, Udaipur · 7:30 PM</p>
          <p className="text-success-text mt-2 flex items-center gap-1.5 text-xs font-medium">
            <CircleCheck className="size-3.5" />
            Attending (4)
          </p>
        </div>
        <div className="bg-primary text-primary-foreground mt-3 rounded-full py-2 text-center text-sm font-medium">
          Attending
        </div>
        <div className="border-border mt-2 rounded-full border py-2 text-center text-sm">
          Not attending
        </div>
      </PhoneFrame>
    </div>
  );
}

function Stepper({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="border-border flex items-center gap-3 rounded-full border px-2 py-1">
        <Minus className="size-3" />
        <span className="text-text font-medium">{value}</span>
        <Plus className="size-3" />
      </span>
    </div>
  );
}

export function RsvpPhoneMockup({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <PhoneFrame>
        <Eyebrow>Your invitation</Eyebrow>
        <p className="font-heading mt-2 text-center text-lg">Sharma family</p>
        <p className="text-text-muted text-center text-xs">Nafiya &amp; Irfan warmly invite you</p>

        <div className="bg-background border-border mt-4 rounded-xl border p-3">
          <p className="text-sm font-medium">Sangeet</p>
          <p className="text-text-muted text-xs">15 Nov · 7:00 PM · The Courtyard</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-success-text flex items-center gap-1.5 text-xs font-medium">
              <CircleCheck className="size-3.5" />
              Attending (4)
            </span>
            <span className="bg-success-bg text-success-text rounded-full px-2 py-0.5 text-[0.625rem] font-medium">
              Replied
            </span>
          </div>
        </div>

        <div className="bg-background border-border mt-3 space-y-2 rounded-xl border p-3">
          <p className="text-sm font-medium">Wedding</p>
          <p className="text-text-muted text-xs">16 Nov · 4:30 PM · Lakefront lawn</p>
          <Stepper label="How many are coming? (up to 5)" value={4} />
        </div>

        <div className="bg-primary text-primary-foreground mt-4 rounded-full py-2 text-center text-sm font-medium">
          Save reply
        </div>
      </PhoneFrame>
    </div>
  );
}
