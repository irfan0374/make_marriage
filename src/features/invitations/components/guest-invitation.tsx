'use client';

import {
  CalendarDays,
  CalendarPlus,
  CircleCheck,
  Clock,
  Lock,
  MapPin,
  Map as MapIcon,
  Save,
  Shirt,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  calendarUrl,
  markOpened,
  saveGuestReplies,
  stopReminders,
} from '@/features/invitations/api';
import { RSVP_NOTE_MAX } from '@/modules/households/households.schemas';
import type {
  PublicInvitation,
  PublicInvitationEvent,
} from '@/modules/invitations/invitations.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { formatDate, formatLongDate, formatTime } from '@/shared/dates';
import { ReplyPicker, type ReplyValue } from './reply-picker';

// The family's personal invitation page (Stitch "Personal Invitation & RSVP (Mobile)", PRD
// INV-10 to INV-15): greeting, the couple's card and message, and only the events this family is
// invited to, each with its reply. Also the couple's preview, where nothing is saved.

type Draft = ReplyValue & { note: string };

const card = 'bg-surface border-border/70 rounded-card shadow-card border';
const chip = 'rounded-full px-3 py-1 text-xs font-medium';

function draftOf(event: PublicInvitationEvent): Draft {
  return {
    status: event.rsvp?.status ?? null,
    attendingCount: event.rsvp?.status === 'attending' ? event.rsvp.attendingCount : 0,
    note: event.rsvp?.note ?? '',
  };
}

function sameAsSaved(draft: Draft, event: PublicInvitationEvent): boolean {
  const saved = draftOf(event);
  return (
    draft.status === saved.status &&
    (draft.status !== 'attending' || draft.attendingCount === saved.attendingCount) &&
    draft.note.trim() === saved.note
  );
}

function timeLine(event: PublicInvitationEvent): string {
  const start = formatTime(event.startTime);
  return event.endTime ? `${start} – ${formatTime(event.endTime)}` : `${start} onwards`;
}

/** "12 – 14 Apr 2028", or one date. */
function dateRange(dates: string[], fallback: string): string {
  const sorted = [...dates].sort();
  const first = sorted[0] ?? fallback;
  const last = sorted[sorted.length - 1] ?? fallback;
  if (first === last) return formatDate(first);
  const [a, b] = [formatDate(first), formatDate(last)];
  // Same month and year: "12 – 14 Apr 2028".
  return a.slice(-8) === b.slice(-8) ? `${a.split(' ')[0]} – ${b}` : `${a} – ${b}`;
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase();

function EventCard({
  event,
  index,
  total,
  draft,
  onChange,
  token,
  open,
}: {
  event: PublicInvitationEvent;
  index: number;
  total: number;
  draft: Draft;
  onChange: (draft: Draft) => void;
  token: string | null;
  open: boolean;
}) {
  const saved = Boolean(event.rsvp) && sameAsSaved(draft, event);
  const changed = !sameAsSaved(draft, event);
  const needsAnswer = !event.rsvp && !draft.status;
  const place = [event.venueName, event.address].filter(Boolean).join(', ');

  return (
    <li className={`${card} p-6`}>
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(chip, needsAnswer ? 'bg-pending-bg text-pending-text' : 'bg-background')}
        >
          Event {index + 1} of {total}
          {needsAnswer && ' · Needs response'}
        </span>
        {saved ? (
          <span className={cn(chip, 'bg-background flex items-center gap-1.5')}>
            <span aria-hidden className="bg-pending-text size-1.5 rounded-full" />
            Saved
          </span>
        ) : changed ? (
          <span className={cn(chip, 'bg-primary-tint text-primary')}>Not saved yet</span>
        ) : (
          <span className={cn(chip, 'bg-background text-text-muted')}>Pending</span>
        )}
      </div>
      <h3 className="text-primary mt-3 text-3xl font-normal">{event.name}</h3>
      <ul className="text-text-muted mt-4 space-y-2.5 text-sm">
        <li className="flex gap-3">
          <Clock aria-hidden className="text-pending-text mt-0.5 size-4 shrink-0" />
          {formatLongDate(event.date)} · {timeLine(event)}
        </li>
        {place && (
          <li className="flex gap-3">
            <MapPin aria-hidden className="text-pending-text mt-0.5 size-4 shrink-0" />
            {place}
          </li>
        )}
        {event.dressCode && (
          <li className="flex gap-3">
            <Shirt aria-hidden className="text-pending-text mt-0.5 size-4 shrink-0" />
            <span>
              Dress code: <strong className="text-text font-semibold">{event.dressCode}</strong>
            </span>
          </li>
        )}
      </ul>
      {event.notes && (
        <p className="text-text-muted mt-3 text-sm whitespace-pre-line">{event.notes}</p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {event.mapUrl ? (
          <a
            href={event.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-background hover:bg-background-alt flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold"
          >
            <MapIcon aria-hidden className="size-4" />
            Maps
          </a>
        ) : null}
        {token ? (
          <a
            href={calendarUrl(token, event.id)}
            className={cn(
              'bg-background hover:bg-background-alt flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold',
              !event.mapUrl && 'col-span-2',
            )}
          >
            <CalendarPlus aria-hidden className="size-4" />
            Add to calendar
          </a>
        ) : (
          <span
            className={cn(
              'bg-background text-text-muted flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold',
              !event.mapUrl && 'col-span-2',
            )}
          >
            <CalendarPlus aria-hidden className="size-4" />
            Add to calendar
          </span>
        )}
      </div>

      <div className="bg-background rounded-card mt-5 p-5">
        {open ? (
          <>
            <ReplyPicker
              question={`Will your family attend ${event.name}?`}
              value={draft}
              max={event.maxHeadcount}
              onChange={(value) => onChange({ ...draft, ...value })}
            />
            {draft.status === 'attending' && (
              <label className="mt-4 block">
                <span className="text-text-muted text-sm">Food or arrival notes (optional)</span>
                <input
                  value={draft.note}
                  maxLength={RSVP_NOTE_MAX}
                  onChange={(e) => onChange({ ...draft, note: e.target.value })}
                  placeholder="e.g. Vegetarian meals for all 3"
                  className="border-border bg-surface rounded-input mt-1.5 h-11 w-full border px-4 text-sm"
                />
              </label>
            )}
          </>
        ) : (
          <p className="text-sm">
            <span className="font-semibold">Your reply: </span>
            {event.rsvp
              ? event.rsvp.status === 'attending'
                ? `Attending · ${event.rsvp.attendingCount} ${event.rsvp.attendingCount === 1 ? 'person' : 'people'}`
                : 'Not attending'
              : 'No reply'}
          </p>
        )}
      </div>
    </li>
  );
}

/** "Stop reminder emails" (api-spec §11.4); the reminder email links here. */
function StopReminders({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  return (
    <section id="stop-reminders" className="text-text-muted mt-6 text-center text-sm">
      {state === 'done' ? (
        <p role="status">We won&apos;t send you any more reminder emails.</p>
      ) : (
        <>
          <p>Getting reminder emails you don&apos;t need?</p>
          <button
            type="button"
            disabled={state === 'saving'}
            onClick={() => {
              setState('saving');
              stopReminders(token).then(
                () => setState('done'),
                () => setState('error'),
              );
            }}
            className="text-text mt-1 font-medium underline underline-offset-4 hover:no-underline disabled:opacity-60"
          >
            {state === 'saving' ? 'Saving…' : 'Stop reminder emails'}
          </button>
          {state === 'error' && (
            <p role="alert" className="text-danger-text mt-1">
              That didn&apos;t work. Please try again.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function GuestInvitation({
  invitation: initialInvitation,
  token,
}: {
  invitation: PublicInvitation;
  /** The personal link token; `null` in the couple's preview, where nothing is saved. */
  token: string | null;
}) {
  const [invitation, setInvitation] = useState(initialInvitation);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialInvitation.events.map((e) => [e.id, draftOf(e)])),
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    kind: 'saved' | 'error' | 'preview';
    text: string;
  } | null>(null);
  const { wedding, household, events } = invitation;
  const couple = `${wedding.brideName} & ${wedding.groomName}`;
  const open = invitation.rsvpOpen;

  // Count the visit once the page has loaded in a real browser (api-spec §11.5).
  useEffect(() => {
    if (token) markOpened(token).catch(() => undefined);
  }, [token]);

  const answered = events.filter((e) => drafts[e.id]?.status).length;
  const changed = useMemo(
    () => events.filter((e) => drafts[e.id] && !sameAsSaved(drafts[e.id]!, e)),
    [events, drafts],
  );
  const people = household.members.map((m) => m.name);
  const invitedPeople = Math.max(0, ...events.map((e) => e.maxHeadcount));

  async function save() {
    const responses = changed
      .filter((e) => drafts[e.id]!.status)
      .map((e) => {
        const d = drafts[e.id]!;
        return {
          eventId: e.id,
          status: d.status!,
          attendingCount: d.status === 'attending' ? d.attendingCount : 0,
          note: d.status === 'attending' ? d.note.trim() : '',
        };
      });
    if (responses.length === 0) {
      setNotice({ kind: 'error', text: 'Choose Attending or Not attending for an event first.' });
      return;
    }
    if (!token) {
      setNotice({
        kind: 'preview',
        text: "This is a preview, so replies aren't saved. Your guests' replies will be.",
      });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const next = await saveGuestReplies(token, { responses });
      setInvitation(next);
      setDrafts(Object.fromEntries(next.events.map((e) => [e.id, draftOf(e)])));
      const waiting = next.events.filter((e) => !e.rsvp).length;
      setNotice({
        kind: 'saved',
        text:
          waiting === 0
            ? `Thank you! ${couple} have your replies. You can change them here until the deadline.`
            : `Saved. ${waiting} ${waiting === 1 ? 'event is' : 'events are'} still waiting for your answer.`,
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof ApiError
            ? error.code === 'RSVP_CLOSED'
              ? `Replies are closed now. Please contact ${couple} directly.`
              : error.message
            : 'Could not reach the server. Check your connection and try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn('bg-background', token ? 'min-h-dvh pb-48' : 'rounded-card pb-4')}>
      <main className="mx-auto max-w-xl px-4 pt-8 sm:px-6">
        <p className="text-pending-text flex items-center justify-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
          <span>Wedding invitation</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1">
            <Lock aria-hidden className="size-3" />
            {token ? 'Private link' : 'Preview'}
          </span>
        </p>

        <header className="mt-6 text-center">
          <h1 className="text-4xl font-normal">Welcome, {household.displayName}</h1>
          {(people.length > 0 || invitedPeople > 0) && (
            <p className="text-text-muted mt-2 text-sm">
              {people.join(', ')}
              {people.length > 0 && invitedPeople > 0 && ' · '}
              {invitedPeople > 0 &&
                `${invitedPeople} ${invitedPeople === 1 ? 'guest' : 'guests'} invited`}
            </p>
          )}
        </header>

        <section className={`${card} mt-8 overflow-hidden`} aria-label="Invitation card">
          {invitation.invitation.media ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
            <img
              src={invitation.invitation.media.url}
              alt={`Wedding invitation from ${couple}`}
              className="block h-auto w-full"
            />
          ) : (
            <div className="px-8 py-12 text-center">
              <span className="border-gold/60 text-primary font-heading mx-auto flex size-16 items-center justify-center rounded-full border text-xl">
                {initial(wedding.brideName)}&amp;{initial(wedding.groomName)}
              </span>
              <p className="text-text-muted mt-6 text-xs tracking-[0.14em] uppercase">
                Together with their families
              </p>
              <p className="font-heading text-primary mt-3 text-4xl font-normal">{couple}</p>
              <p className="text-text-muted mx-auto mt-3 max-w-xs text-sm">
                invite you to celebrate their wedding and bless them with your presence
              </p>
            </div>
          )}
          <div className="border-border/60 space-y-2 border-t px-6 py-5 text-sm">
            <p className="flex items-center gap-3">
              <CalendarDays aria-hidden className="text-pending-text size-4 shrink-0" />
              {dateRange(
                events.map((e) => e.date),
                wedding.weddingDate,
              )}{' '}
              · {wedding.venue || wedding.city}
            </p>
            {invitation.rsvpDeadline && (
              <p className="flex items-center gap-3">
                <CircleCheck aria-hidden className="text-pending-text size-4 shrink-0" />
                Kindly reply by {formatDate(invitation.rsvpDeadline)}
              </p>
            )}
          </div>
        </section>

        {invitation.invitation.message && (
          <section className="mt-8 px-2 text-center">
            <h2 className="text-text-muted text-xs font-semibold tracking-[0.14em] uppercase">
              A note from {couple}
            </h2>
            <p className="font-heading mt-3 text-lg leading-relaxed whitespace-pre-line">
              {invitation.invitation.message}
            </p>
          </section>
        )}

        {!open && (
          <p
            role="status"
            className="bg-pending-bg text-pending-text rounded-input mt-8 px-4 py-3 text-sm"
          >
            {invitation.closedReason === 'deadline' && invitation.rsvpDeadline
              ? `Replies closed on ${formatDate(invitation.rsvpDeadline)}. To change your reply, please contact ${couple} directly.`
              : `Replies are closed. Please contact ${couple} directly.`}
          </p>
        )}

        <section className="mt-10" aria-labelledby="celebrations">
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <h2 id="celebrations" className="text-2xl font-normal whitespace-nowrap">
              Your celebrations
            </h2>
            <p className="text-text-muted text-sm">
              {events.length} {events.length === 1 ? 'event' : 'events'} for your family
            </p>
          </div>
          {events.length === 0 ? (
            <p className={`${card} text-text-muted mt-4 p-6 text-sm`}>
              The event details will appear here soon. Please check back later.
            </p>
          ) : (
            <ol className="mt-4 space-y-5">
              {events.map((event, index) => (
                <EventCard
                  key={event.id}
                  event={event}
                  index={index}
                  total={events.length}
                  draft={drafts[event.id] ?? draftOf(event)}
                  onChange={(draft) => setDrafts((d) => ({ ...d, [event.id]: draft }))}
                  token={token}
                  open={open}
                />
              ))}
            </ol>
          )}
        </section>

        <p className="bg-background-alt/70 rounded-card text-text-muted mt-8 flex gap-3 p-5 text-sm">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Private personal link for <strong className="text-text">{household.displayName}</strong>
            . No other guests can see or change your replies.
          </span>
        </p>
        {token && invitation.canStopReminders && <StopReminders token={token} />}
      </main>

      {open && events.length > 0 && (
        <div
          className={cn(
            'border-border/60 bg-background/95 z-30 border-t backdrop-blur',
            // The couple's preview sits inside the app, so its bar stays within the page.
            token ? 'fixed inset-x-0 bottom-0' : 'sticky bottom-0 mt-8',
          )}
        >
          <div className="mx-auto max-w-xl space-y-3 px-4 py-4 sm:px-6">
            {notice && (
              <p
                role={notice.kind === 'error' ? 'alert' : 'status'}
                className={cn(
                  'rounded-input px-4 py-2.5 text-sm',
                  notice.kind === 'error'
                    ? 'bg-danger-bg text-danger-text'
                    : notice.kind === 'saved'
                      ? 'bg-success-bg text-success-text'
                      : 'bg-pending-bg text-pending-text',
                )}
              >
                {notice.text}
              </p>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                {answered} of {events.length} answered
              </span>
              <span className="text-text-muted">Save now, finish anytime</span>
            </div>
            <div aria-hidden className="bg-background-alt h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-pending-text h-full rounded-full transition-[width]"
                style={{ width: `${(answered / events.length) * 100}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="bg-primary text-primary-foreground flex h-13 w-full items-center justify-center gap-2 rounded-full text-base font-semibold shadow-lg disabled:opacity-70"
            >
              <Save aria-hidden className="size-5" />
              {saving
                ? 'Saving…'
                : changed.length === 0 && events.some((e) => e.rsvp)
                  ? 'Replies saved'
                  : 'Save my replies'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
