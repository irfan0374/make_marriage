'use client';

import {
  Bell,
  CalendarDays,
  Download,
  Eye,
  ImagePlus,
  Mail,
  MailCheck,
  MailOpen,
  MessageCircle,
  Send,
  Clock,
  CircleCheck,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { FormAlert, FormTextarea } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useEvents } from '@/features/events/hooks';
import { rsvpExportUrl, uploadFile } from '@/features/invitations/api';
import {
  useEmailReach,
  useInvitationSettings,
  useRsvpSummary,
  useSaveInvitation,
  useSendTestInvitation,
} from '@/features/invitations/hooks';
import { useWedding } from '@/features/weddings/hooks';
import type { WeddingEvent } from '@/modules/events/events.types';
import {
  fileProblem,
  FILE_RULES,
  SNIFF_BYTES,
  sniffImageType,
} from '@/modules/files/files.schemas';
import type { RsvpSummary } from '@/modules/households/households.types';
import {
  INVITATION_MESSAGE_MAX,
  updateInvitationSchema,
} from '@/modules/invitations/invitations.schemas';
import type { InvitationSettings } from '@/modules/invitations/invitations.types';
import type { Wedding } from '@/modules/weddings/weddings.types';
import { SendDialog } from './send-dialog';
import { SendProgress } from './send-progress';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { daysUntil, formatDate, formatLongDate, todayIn } from '@/shared/dates';

// The Invitations & RSVP page (Stitch "Invitations and RSVP"; PRD INV-1 to INV-3, INV-16,
// INV-19): the card, message and deadline; how far sending has got; and replies per event.
// Sending by email comes with the job queue, so those buttons are "Soon" for now.

const card = 'border-border bg-surface rounded-card shadow-card border';
const MB = 1024 * 1024;

function messageOf(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Could not reach the server. Check your connection and try again.';
}

function SectionTitle({
  number,
  title,
  aside,
}: {
  number: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h2 className="flex items-baseline gap-2.5 text-2xl font-normal">
        <span className="text-pending-text font-sans text-xs font-semibold">{number}</span>
        {title}
      </h2>
      {aside}
    </div>
  );
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase();

/** The card as guests will see it first: the uploaded image, or the couple's names. */
function CardPreview({
  wedding,
  settings,
  dates,
}: {
  wedding: Wedding;
  settings: InvitationSettings;
  dates: string;
}) {
  return (
    <div className="border-primary/80 bg-background mx-auto w-full max-w-72 rounded-[2.5rem] border-[10px] p-2 shadow-xl">
      <div className="bg-surface flex min-h-112 flex-col overflow-hidden rounded-[1.8rem]">
        {settings.media ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
          <img
            src={settings.media.url}
            alt="Your invitation card"
            className="block h-auto max-h-112 w-full object-contain"
          />
        ) : (
          <div className="flex flex-1 flex-col items-center px-6 pt-10 text-center">
            <span className="border-gold/60 text-primary font-heading flex size-12 items-center justify-center rounded-full border">
              {initial(wedding.brideName)}&amp;{initial(wedding.groomName)}
            </span>
            <p className="text-pending-text mt-5 text-[10px] font-semibold tracking-[0.2em] uppercase">
              Together with their families
            </p>
            <p className="font-heading mt-3 text-3xl leading-tight">
              {wedding.brideName} &amp; {wedding.groomName}
            </p>
            <p className="text-text-muted mt-3 text-xs">invite you to celebrate their wedding</p>
            <p className="bg-background rounded-input mt-8 w-full px-4 py-3 text-sm">
              {dates}
              <span className="text-pending-text block text-xs">
                {wedding.venue || wedding.city}
              </span>
            </p>
            <span className="bg-primary text-primary-foreground mt-auto mb-2 w-full rounded-full py-2.5 text-xs font-semibold">
              Reply now
            </span>
            <p className="text-text-muted mb-5 text-[11px]">
              {settings.rsvpDeadline
                ? `Kindly reply by ${formatDate(settings.rsvpDeadline)}`
                : 'Families reply on their personal page'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CardSection({
  weddingId,
  wedding,
  settings,
  events,
}: {
  weddingId: string;
  wedding: Wedding;
  settings: InvitationSettings;
  events: WeddingEvent[];
}) {
  const save = useSaveInvitation(weddingId);
  const test = useSendTestInvitation(weddingId);
  const [message, setMessage] = useState(settings.message);
  const [deadline, setDeadline] = useState(settings.rsvpDeadline ?? '');
  const [reminders, setReminders] = useState(settings.autoRemindersEnabled);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const remindersId = useId();
  const archived = wedding.status === 'archived';

  const dirty =
    message.trim() !== settings.message ||
    (deadline || null) !== settings.rsvpDeadline ||
    reminders !== settings.autoRemindersEnabled;
  // A new deadline can't be in the past (the API refuses it); a saved one that has passed stays.
  const today = todayIn(wedding.timezone);
  const deadlineMin = settings.rsvpDeadline && settings.rsvpDeadline < today ? undefined : today;
  // How the deadline sits against the next event families will attend (past ones don't count).
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const firstEvent = sorted.find((e) => e.date >= today) ?? sorted[0];
  const deadlineHint =
    deadline && firstEvent
      ? (() => {
          const days = daysUntil(firstEvent.date, 'UTC', new Date(`${deadline}T00:00:00Z`));
          const which = `${firstEvent.name}, your first event`;
          if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} before ${which}`;
          if (days === 0) return `On the day of ${which}`;
          return `${-days} ${days === -1 ? 'day' : 'days'} after ${which}. Families can still reply once it has started.`;
        })()
      : `On or before ${formatDate(settings.latestDeadline)}, the last event`;

  // Only the text settings: the card is saved on its own, so a stale card never blocks a save.
  const input = () => ({ message, rsvpDeadline: deadline, autoRemindersEnabled: reminders });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    setFormError(null);
    const parsed = updateInvitationSchema.safeParse(input());
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
      );
      return;
    }
    setFieldErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => setSaved(true),
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fieldErrors()).length > 0) {
          setFieldErrors(error.fieldErrors());
        } else setFormError(messageOf(error));
      },
    });
  }

  async function chooseCard(file: File | undefined) {
    if (!file) return;
    setCardError(null);
    const problem = fileProblem('invitation', { contentType: file.type, sizeBytes: file.size });
    if (problem === 'UNSUPPORTED_FILE_TYPE') {
      setCardError('Choose a JPG, PNG or WebP image. Video cards are coming later.');
      return;
    }
    if (problem === 'FILE_TOO_LARGE') {
      setCardError(`Choose an image under ${FILE_RULES.invitation.maxBytes / MB} MB.`);
      return;
    }
    // A renamed file (say a PDF called card.jpg) is caught by its content, not its name.
    const start = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    if (sniffImageType(start) !== file.type) {
      setCardError("This file isn't a JPG, PNG or WebP image. Choose the card image itself.");
      return;
    }
    setUploading(true);
    try {
      const key = await uploadFile(weddingId, 'invitation', file);
      // Only the card changes; the form's unsaved text stays as typed.
      await save.mutateAsync({ mediaKey: key });
    } catch (error) {
      setCardError(messageOf(error));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removeCard() {
    setCardError(null);
    save.mutate({ mediaKey: null }, { onError: (error) => setCardError(messageOf(error)) });
  }

  const dates = (() => {
    const sorted = events.map((e) => e.date).sort();
    if (sorted.length === 0) return formatDate(wedding.weddingDate);
    const [first, last] = [sorted[0]!, sorted[sorted.length - 1]!];
    return first === last ? formatDate(first) : `${formatDate(first)} – ${formatDate(last)}`;
  })();

  return (
    <section aria-labelledby="card-title" className="mb-12">
      <SectionTitle
        number="01"
        title="Your invitation card"
        aside={<span className="text-text-muted text-xs">What families see first</span>}
      />
      <h2 id="card-title" className="sr-only">
        Your invitation card
      </h2>
      <div className={`${card} grid gap-10 p-6 md:p-10 lg:grid-cols-[minmax(0,340px)_1fr]`}>
        <div className="space-y-4">
          <CardPreview wedding={wedding} settings={settings} dates={dates} />
          <input
            ref={fileRef}
            type="file"
            accept={FILE_RULES.invitation.types.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void chooseCard(e.target.files?.[0])}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              className="border-border bg-background h-10 gap-2 px-5"
              disabled={uploading || save.isPending || archived}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus aria-hidden className="size-4" />
              {uploading
                ? 'Uploading…'
                : settings.media
                  ? 'Replace card image'
                  : 'Upload card image'}
            </Button>
            {settings.media && (
              <Button
                variant="ghost"
                className="text-danger-text hover:bg-danger-bg h-10 gap-2 px-4"
                disabled={uploading || save.isPending || archived}
                onClick={removeCard}
              >
                <Trash2 aria-hidden className="size-4" />
                Remove
              </Button>
            )}
          </div>
          <p className="text-text-muted text-center text-xs">
            JPG, PNG or WebP, up to {FILE_RULES.invitation.maxBytes / MB} MB.
            {!settings.media && ' Without a card, guests see your names as above.'}
          </p>
          <FormAlert message={cardError} />
        </div>

        <form onSubmit={submit} noValidate className="space-y-6">
          <FormAlert message={formError} />
          <FormTextarea
            label="Invitation message"
            rows={5}
            maxLength={INVITATION_MESSAGE_MAX}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setSaved(false);
            }}
            error={fieldErrors.message}
            hint={`Shown in the email and on each family's page. ${message.length}/${INVITATION_MESSAGE_MAX}`}
            disabled={archived}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-background rounded-input space-y-1.5 p-4">
              <Label htmlFor="rsvp-deadline">RSVP deadline</Label>
              <Input
                id="rsvp-deadline"
                type="date"
                min={deadlineMin}
                max={settings.latestDeadline}
                value={deadline}
                aria-invalid={fieldErrors.rsvpDeadline ? true : undefined}
                aria-describedby="rsvp-deadline-hint"
                onChange={(e) => {
                  setDeadline(e.target.value);
                  setSaved(false);
                }}
                disabled={archived}
              />
              <p
                id="rsvp-deadline-hint"
                className={cn(
                  'text-xs',
                  fieldErrors.rsvpDeadline ? 'text-danger-text' : 'text-text-muted',
                )}
              >
                {fieldErrors.rsvpDeadline ??
                  (deadline ? deadlineHint : 'Optional. Replies stay open until you set one.')}
              </p>
            </div>
            <div className="bg-background rounded-input flex items-start justify-between gap-4 p-4">
              <div>
                <p id={`${remindersId}-label`} className="text-sm font-medium">
                  Automatic reminders
                </p>
                <p id={`${remindersId}-hint`} className="text-text-muted mt-1 text-xs">
                  Emails families who haven&apos;t replied, 7 and 2 days before the deadline. Starts
                  when email sending is ready.
                </p>
              </div>
              <Switch
                aria-labelledby={`${remindersId}-label`}
                aria-describedby={`${remindersId}-hint`}
                checked={reminders}
                onCheckedChange={(checked) => {
                  setReminders(checked);
                  setSaved(false);
                }}
                disabled={archived}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              className="h-11 px-6"
              disabled={!dirty || save.isPending || archived}
            >
              {save.isPending && !uploading ? 'Saving…' : 'Save changes'}
            </Button>
            <p role="status" className="text-text-muted text-sm">
              {saved && !dirty ? 'Saved.' : dirty ? 'You have unsaved changes.' : ''}
            </p>
          </div>

          <div className="bg-background-alt/60 rounded-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
                <Eye aria-hidden className="size-4.5" />
              </span>
              <div>
                <p className="font-heading text-lg">Preview what your guests will see</p>
                <p className="text-text-muted text-xs">
                  Try the reply flow with a sample family, or email the invitation to yourself.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/app/${weddingId}/invitations/preview`}
                className="border-border bg-surface hover:border-primary/40 flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
              >
                <Eye aria-hidden className="size-4" />
                Preview
              </Link>
              <Button
                variant="outline"
                className="border-border bg-surface h-10 gap-2 px-4"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                <Send aria-hidden className="size-4" />
                {test.isPending ? 'Sending…' : 'Send test to myself'}
              </Button>
            </div>
          </div>
          {(test.isSuccess || test.isError) && (
            <p
              role={test.isError ? 'alert' : 'status'}
              className={cn(
                'rounded-input px-4 py-3 text-sm',
                test.isError ? 'bg-danger-bg text-danger-text' : 'bg-success-bg text-success-text',
              )}
            >
              {test.isError
                ? messageOf(test.error)
                : `Test sent to ${test.data.sentTo}. Save first if you changed the message.`}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  percent,
  highlight,
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof Mail;
  percent?: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn('bg-background rounded-card p-5', highlight && 'ring-pending-text/30 ring-1')}
    >
      <p className="flex items-center justify-between text-sm font-medium">
        {label}
        <Icon aria-hidden className="text-text-muted size-4" />
      </p>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="font-heading text-4xl">{value}</span>
        {percent !== undefined && (
          <span className="bg-pending-bg text-pending-text rounded-full px-2 py-0.5 text-[11px] font-semibold">
            {percent}%
          </span>
        )}
      </p>
      <p className="text-text-muted mt-1 text-xs">{note}</p>
    </div>
  );
}

function SendingSection({
  weddingId,
  summary,
  archived,
}: {
  weddingId: string;
  summary: RsvpSummary;
  archived: boolean;
}) {
  const o = summary.overall;
  // Who each button would really email (the dialog's own dry run), e.g. not families without an
  // email, with no events, or who turned reminders off.
  const inviteReach = useEmailReach(weddingId, 'invite').data;
  const remindReach = useEmailReach(weddingId, 'remind').data;
  const [dialog, setDialog] = useState<'invite' | 'remind' | null>(null);
  return (
    <section aria-labelledby="sending-title" className="mb-12">
      <SectionTitle
        number="02"
        title="Sending & tracking"
        aside={
          summary.sideScope && (
            <span className="text-text-muted text-xs">
              {summary.sideScope === 'bride' ? 'Bride side' : 'Groom side'} families only
            </span>
          )
        }
      />
      <h2 id="sending-title" className="sr-only">
        Sending and tracking
      </h2>
      <div className={`${card} space-y-6 p-6 md:p-8`}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Not sent" value={o.notSent} note="Not shared yet" icon={Clock} />
          <StatCard
            label="Sent"
            value={o.sent}
            note="By email or shared by hand"
            icon={MailCheck}
          />
          <StatCard
            label="Opened"
            value={o.opened}
            percent={pct(o.opened, o.sent)}
            note="Viewed their page"
            icon={MailOpen}
            highlight
          />
          <StatCard
            label="Replied"
            value={o.complete}
            percent={pct(o.complete, o.households)}
            note={o.partial > 0 ? `${o.partial} partly replied` : 'Answered every event'}
            icon={CircleCheck}
          />
        </div>

        <SendProgress weddingId={weddingId} />

        <div className="flex flex-wrap gap-3">
          <Button
            className="h-11 gap-2 px-5"
            disabled={archived || !inviteReach}
            onClick={() => setDialog('invite')}
          >
            <Send aria-hidden className="size-4" />
            Email all not sent{inviteReach === undefined ? '' : ` (${inviteReach})`}
          </Button>
          <Button
            variant="outline"
            className="border-border bg-background h-11 gap-2 px-5"
            disabled={archived || !remindReach}
            onClick={() => setDialog('remind')}
          >
            <Bell aria-hidden className="size-4" />
            Remind families who haven&apos;t replied
            {remindReach === undefined ? '' : ` (${remindReach})`}
          </Button>
        </div>
        {dialog && (
          <SendDialog
            weddingId={weddingId}
            title={dialog === 'invite' ? 'Email the invitation' : 'Remind families'}
            request={
              dialog === 'invite'
                ? { kind: 'invite', input: { filter: 'all_not_sent', dryRun: false } }
                : { kind: 'remind', input: { filter: 'all_incomplete', dryRun: false } }
            }
            onClose={() => setDialog(null)}
          />
        )}

        <div className="bg-background-alt/60 rounded-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="bg-pending-bg text-pending-text flex size-10 shrink-0 items-center justify-center rounded-full">
              <MessageCircle aria-hidden className="size-4.5" />
            </span>
            <div>
              <p className="font-medium">
                {o.withoutEmail > 0
                  ? `${o.withoutEmail} ${o.withoutEmail === 1 ? 'family has' : 'families have'} no email`
                  : 'Share links on WhatsApp'}
              </p>
              <p className="text-text-muted text-sm">
                Open a family on the Guests page to copy their personal link or share it on
                WhatsApp, then mark it as sent.
              </p>
            </div>
          </div>
          <Link
            href={`/app/${weddingId}/guests`}
            className="border-border bg-surface hover:border-primary/40 flex h-10 shrink-0 items-center justify-center rounded-full border px-5 text-sm font-semibold"
          >
            Go to guests
          </Link>
        </div>
      </div>
    </section>
  );
}

function RepliesSection({
  weddingId,
  summary,
  events,
}: {
  weddingId: string;
  summary: RsvpSummary;
  events: WeddingEvent[];
}) {
  // Only events at least one family is invited to, as the summary lists them (api-spec §10.9).
  const rows = events.flatMap((event) => {
    const totals = summary.events.find((e) => e.eventId === event.id);
    return totals && totals.invitedHouseholds > 0 ? [{ event, totals }] : [];
  });
  const hidden = events.length - rows.length;
  const families = (n: number) => `${n} ${n === 1 ? 'family' : 'families'}`;
  return (
    <section aria-labelledby="replies-title">
      <SectionTitle
        number="03"
        title="Replies by event"
        aside={
          <a
            href={rsvpExportUrl(weddingId)}
            download
            className="border-border bg-surface hover:border-primary/40 flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
          >
            <Download aria-hidden className="size-4" />
            Export CSV
          </a>
        }
      />
      <h2 id="replies-title" className="sr-only">
        Replies by event
      </h2>
      {events.length === 0 ? (
        <p className={`${card} text-text-muted p-8 text-center text-sm`}>
          Add your events first, then invite families to them.{' '}
          <Link href={`/app/${weddingId}/events`} className="text-primary font-medium underline">
            Go to events
          </Link>
        </p>
      ) : rows.length === 0 ? (
        <p className={`${card} text-text-muted p-8 text-center text-sm`}>
          No families are invited to an event yet. Choose their events on the Guests page.{' '}
          <Link href={`/app/${weddingId}/guests`} className="text-primary font-medium underline">
            Go to guests
          </Link>
        </p>
      ) : (
        <div className={`${card} overflow-hidden`}>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-background text-text-muted text-left text-xs">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Event
                  </th>
                  {[
                    'Invited families',
                    'Invited guests',
                    'Replied',
                    'Attending families',
                    'Attending guests',
                    'Declined',
                    'Waiting',
                  ].map((h) => (
                    <th key={h} scope="col" className="px-3 py-3 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {rows.map(({ event, totals: t }) => (
                  <tr key={event.id}>
                    <th scope="row" className="px-5 py-4 text-left font-normal">
                      <span className="font-heading block text-base">{event.name}</span>
                      <span className="text-text-muted text-xs">
                        {formatDate(event.date).slice(0, -5)}
                        {event.venueName && ` · ${event.venueName}`}
                      </span>
                    </th>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {t?.invitedHouseholds ?? 0}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {t?.invitedHeadcount ?? 0}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {t?.respondedHouseholds ?? 0}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {t?.attendingHouseholds ?? 0}
                    </td>
                    <td className="font-heading px-3 py-4 text-right text-lg tabular-nums">
                      {t?.attendingHeadcount ?? 0}
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">
                      {t?.declinedHouseholds ?? 0}
                    </td>
                    <td className="text-pending-text px-3 py-4 text-right tabular-nums">
                      {t?.pendingHouseholds ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-border/60 divide-y md:hidden">
            {rows.map(({ event, totals: t }) => (
              <li key={event.id} className="p-5">
                <p className="font-heading text-lg">{event.name}</p>
                <p className="text-text-muted text-xs">{formatLongDate(event.date)}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-text-muted">Invited</dt>
                  <dd className="text-right">
                    {families(t?.invitedHouseholds ?? 0)} · {t?.invitedHeadcount ?? 0} guests
                  </dd>
                  <dt className="text-text-muted">Attending</dt>
                  <dd className="text-right font-semibold">{t?.attendingHeadcount ?? 0} guests</dd>
                  <dt className="text-text-muted">Declined</dt>
                  <dd className="text-right">{families(t?.declinedHouseholds ?? 0)}</dd>
                  <dt className="text-text-muted">Waiting</dt>
                  <dd className="text-pending-text text-right">
                    {families(t?.pendingHouseholds ?? 0)}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
          <p className="bg-background text-text-muted flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 text-xs">
            <span>
              <strong className="text-text">{families(summary.overall.households)}</strong> on your
              list
            </span>
            <span>{families(summary.overall.complete)} replied for every event</span>
            <span>{families(summary.overall.none)} with no reply yet</span>
            {hidden > 0 && (
              <span>
                {hidden} {hidden === 1 ? 'event has' : 'events have'} no families invited, so{' '}
                {hidden === 1 ? "it isn't" : "they aren't"} shown
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

export function InvitationsPage({ weddingId }: { weddingId: string }) {
  const { data: wedding } = useWedding(weddingId);
  const { data: settings, error, refetch } = useInvitationSettings(weddingId);
  const { data: events } = useEvents(weddingId);
  const { data: summary } = useRsvpSummary(weddingId);

  if (error) {
    return (
      <div role="alert" className="space-y-3 py-20 text-center">
        <h1 className="text-2xl">We couldn&apos;t load your invitation</h1>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-primary font-medium hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!wedding || !settings || !events || !summary) {
    return (
      <p role="status" className="text-text-muted py-20 text-center">
        Loading your invitation…
      </p>
    );
  }

  return (
    <div className="pb-16">
      <header className="border-border/70 mb-10 flex flex-col gap-5 border-b pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-pending-text mb-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
            Guest communications
          </p>
          <h1 className="text-4xl font-normal tracking-tight md:text-5xl">
            Invitations &amp; RSVP
          </h1>
          <p className="text-text-muted mt-2 max-w-xl">
            Your invitation card and message, sharing each family&apos;s personal link, and replies
            for every event.
          </p>
        </div>
        <p className="bg-background-alt flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm md:self-auto">
          <CalendarDays aria-hidden className="text-pending-text size-4" />
          Wedding date: {formatDate(wedding.weddingDate)}
        </p>
      </header>

      {wedding.status === 'archived' && (
        <p
          role="status"
          className="bg-pending-bg text-pending-text rounded-input mb-6 px-4 py-3 text-sm"
        >
          This wedding is archived, so the invitation can&apos;t be changed and replies are closed.
        </p>
      )}

      <CardSection weddingId={weddingId} wedding={wedding} settings={settings} events={events} />
      <SendingSection
        weddingId={weddingId}
        summary={summary}
        archived={wedding.status === 'archived'}
      />
      <RepliesSection weddingId={weddingId} summary={summary} events={events} />
    </div>
  );
}
