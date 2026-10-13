import 'server-only';
import type { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { createElement, type ReactElement } from 'react';
import { APP_NAME, SESSION_COOKIE_NAME } from '@/config/app';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { toObjectId, trustWeddingId, type WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { enforceRateLimits, MINUTE } from '@/lib/rate-limit';
import { randomToken, sha256Hex } from '@/lib/tokens';
import { InvitationEmail, type InvitationEmailProps } from '@/emails/invitation';
import { RsvpConfirmationEmail } from '@/emails/rsvp-confirmation';
import { RsvpReminderEmail, type RsvpReminderEmailProps } from '@/emails/rsvp-reminder';
import { listWeddingEvents, type WeddingEvent } from '@/modules/events';
import { fileViewUrl, removeFile, verifyUploadedFile } from '@/modules/files';
import {
  cancelBatchJobs,
  DeferJobError,
  enqueueJobs,
  familiesWithPendingJobs,
  getBatch,
  listRecentBatches,
  PermanentJobError,
  type BatchCounts,
  type JobDocument,
  type JobHandlers,
  type JobRunTools,
} from '@/modules/jobs';
import {
  chooseFamiliesToEmail,
  findInvitationHousehold,
  getFamilyForEmail,
  invitationScope,
  inviteLinkOf,
  recordInvitationEmailed,
  recordInvitationEmailFailed,
  recordReminded,
  restoreQueuedFamilies,
  withInvitationScope,
  markInvitationOpened,
  saveGuestRsvps,
  stopInvitationReminders,
  type HouseholdDocument,
} from '@/modules/households';
import { resolveWeddingContext } from '@/modules/members';
import {
  dailyEmailsLeft,
  DailyEmailLimitError,
  sendEmail,
  sendQueuedEmail,
} from '@/modules/notifications';
import {
  getWeddingRecord,
  requireWritableWedding,
  saveInvitationSettings,
  type WeddingDocument,
} from '@/modules/weddings';
import { formatDate, todayIn, zonedTimeToUtc } from '@/shared/dates';
import type {
  InvitationSettings,
  PublicInvitation,
  PublicInvitationEvent,
  RemindFamiliesInput,
  SendInvitationsInput,
  SendResult,
  UpdateInvitationInput,
} from './invitations.types';
import type { GuestRsvpInput } from '@/modules/households/households.types';

// Invitations (PRD §5.4, api-spec §10–11): the couple's card, message and deadline; the guest's
// personal page and replies. Bulk sending by email arrives with the job queue.

/** Email images must outlive a short download link: the test email's card shows for a week. */
const EMAIL_IMAGE_SECONDS = 7 * 24 * 60 * 60;

/** Link-preview fetchers and crawlers, which must never count as a guest opening the page. */
const BOT_AGENT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|embedly|vkshare|pinterest|linkedin|googleimageproxy|headless/i;

export const coupleNamesOf = (w: Pick<WeddingDocument, 'brideName' | 'groomName'>) =>
  `${w.brideName} & ${w.groomName}`;

/** Rate limit counters never hold the raw link. */
const linkKey = (token: string) => sha256Hex(token).slice(0, 24);

/** The last day a deadline may be: the last event's date, or the wedding date without events. */
function latestDeadlineOf(wedding: WeddingDocument, events: WeddingEvent[]): string {
  return events.reduce((last, e) => (e.date > last ? e.date : last), '') || wedding.weddingDate;
}

/** Whether guests can still reply, and if not, why (PRD INV-12). */
function rsvpState(
  wedding: Pick<WeddingDocument, 'status' | 'timezone' | 'invitation'>,
  now: Date,
): { open: boolean; closedReason: PublicInvitation['closedReason'] } {
  if (wedding.status === 'archived') return { open: false, closedReason: 'archived' };
  const deadline = wedding.invitation.rsvpDeadline;
  if (deadline && todayIn(wedding.timezone, now) > deadline) {
    return { open: false, closedReason: 'deadline' };
  }
  return { open: true, closedReason: null };
}

async function mediaOf(wedding: WeddingDocument, expiresInSeconds?: number) {
  const { mediaKey, mediaType, mediaSizeBytes } = wedding.invitation;
  if (!mediaKey || mediaType !== 'image') return null;
  return {
    key: mediaKey,
    type: 'image' as const,
    url: await fileViewUrl(mediaKey, expiresInSeconds),
    sizeBytes: mediaSizeBytes ?? 0,
  };
}

async function settingsOf(wedding: WeddingDocument): Promise<InvitationSettings> {
  const events = await listWeddingEvents(trustWeddingId(wedding._id));
  return {
    media: await mediaOf(wedding),
    message: wedding.invitation.message,
    rsvpDeadline: wedding.invitation.rsvpDeadline,
    autoRemindersEnabled: wedding.invitation.autoRemindersEnabled,
    latestDeadline: latestDeadlineOf(wedding, events),
  };
}

async function weddingOf(weddingId: WeddingId): Promise<WeddingDocument> {
  const wedding = await getWeddingRecord(weddingId);
  if (!wedding) throw new AppError('NOT_FOUND');
  return wedding;
}

/** GET /api/weddings/{weddingId}/invitation (api-spec §10.1). */
export async function getInvitationSettings(
  token: string | undefined,
  weddingId: ObjectId,
): Promise<InvitationSettings> {
  const context = await resolveWeddingContext(token, weddingId);
  return settingsOf(await weddingOf(context.weddingId));
}

/**
 * PUT /api/weddings/{weddingId}/invitation (api-spec §10.2). A new card must be an uploaded
 * image of this wedding; the replaced card is deleted from storage. The deadline must be on or
 * before the last event, and a new one today or later in the wedding's timezone.
 */
export async function updateInvitation(
  token: string | undefined,
  weddingId: ObjectId,
  input: UpdateInvitationInput,
  now = new Date(),
): Promise<InvitationSettings> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await requireWritableWedding(context.weddingId);
  const current = wedding.invitation;

  const latest = latestDeadlineOf(wedding, await listWeddingEvents(context.weddingId));
  if (input.rsvpDeadline && input.rsvpDeadline > latest) {
    throw new AppError('VALIDATION_ERROR', undefined, {
      details: [
        {
          path: 'rsvpDeadline',
          message: `Pick a date on or before ${formatDate(latest)}, the last event`,
        },
      ],
    });
  }
  // A new deadline in the past would close replies for every family at once. A deadline that's
  // simply kept may have passed since; saving the message then must still work.
  const today = todayIn(wedding.timezone, now);
  if (
    input.rsvpDeadline &&
    input.rsvpDeadline !== current.rsvpDeadline &&
    input.rsvpDeadline < today
  ) {
    throw new AppError('VALIDATION_ERROR', undefined, {
      details: [{ path: 'rsvpDeadline', message: 'Pick today or a later date' }],
    });
  }

  let media = {
    mediaKey: current.mediaKey,
    mediaType: current.mediaType,
    mediaSizeBytes: current.mediaSizeBytes,
  };
  if (input.mediaKey !== undefined && input.mediaKey !== current.mediaKey) {
    if (input.mediaKey === null) {
      media = { mediaKey: null, mediaType: null, mediaSizeBytes: null };
    } else {
      const file = await verifyUploadedFile(context.weddingId, 'invitation', input.mediaKey);
      media = { mediaKey: file.key, mediaType: 'image', mediaSizeBytes: file.sizeBytes };
    }
  }

  const saved = await saveInvitationSettings(
    context.weddingId,
    {
      ...media,
      message: input.message ?? current.message,
      rsvpDeadline: input.rsvpDeadline !== undefined ? input.rsvpDeadline : current.rsvpDeadline,
      autoRemindersEnabled: input.autoRemindersEnabled ?? current.autoRemindersEnabled,
    },
    now,
  );
  if (current.mediaKey && current.mediaKey !== media.mediaKey) await removeFile(current.mediaKey);
  logger.info('invitation.updated', { weddingId: context.weddingId.toHexString() });
  return settingsOf(saved);
}

/** "Kindly reply by 31 Mar 2028", or nothing without a deadline. */
function deadlineLine(deadline: string | null): string | undefined {
  return deadline ? `Kindly reply by ${formatDate(deadline)}` : undefined;
}

/**
 * POST /api/weddings/{weddingId}/invitation/test (api-spec §10.3): the invitation email, as a
 * sample family would get it, sent to the caller. Its button opens the guest-page preview.
 */
export async function sendTestInvitation(
  token: string | undefined,
  weddingId: ObjectId,
  now = new Date(),
): Promise<{ sentTo: string }> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await weddingOf(context.weddingId);
  const media = await mediaOf(wedding, EMAIL_IMAGE_SECONDS);
  if (!media && !wedding.invitation.message) throw new AppError('INVITATION_NOT_READY');

  const coupleNames = coupleNamesOf(wedding);
  const previewUrl = new URL(
    `/app/${context.weddingId.toHexString()}/invitations/preview`,
    getEnv().APP_URL,
  ).toString();
  const result = await sendEmail(
    {
      template: 'invitation_test',
      to: context.user.email,
      subject: `[Test] ${coupleNames} invite you to their wedding`,
      body: createElement(InvitationEmail, {
        coupleNames,
        familyName: 'Sharma family',
        message: wedding.invitation.message,
        imageUrl: media?.url,
        deadlineLine: deadlineLine(wedding.invitation.rsvpDeadline),
        buttonUrl: previewUrl,
        isTest: true,
      }),
      fromName: coupleNames,
      weddingId: context.weddingId,
      userId: context.userId,
    },
    now,
  );
  if (result === 'failed') throw new AppError('EMAIL_SEND_FAILED');
  return { sentTo: context.user.email };
}

function toPublicEvents(
  events: WeddingEvent[],
  invited: { eventId: string; headcount: number }[],
  rsvps: HouseholdDocument['rsvps'],
): PublicInvitationEvent[] {
  return events.flatMap((event) => {
    const invite = invited.find((i) => i.eventId === event.id);
    if (!invite) return [];
    const rsvp = rsvps.find((r) => r.eventId.toHexString() === event.id);
    return [
      {
        id: event.id,
        name: event.name,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        venueName: event.venueName,
        address: event.address,
        mapUrl: event.mapUrl,
        dressCode: event.dressCode,
        notes: event.notes,
        maxHeadcount: invite.headcount,
        rsvp: rsvp
          ? { status: rsvp.status, attendingCount: rsvp.attendingCount, note: rsvp.note ?? '' }
          : null,
      },
    ];
  });
}

async function publicInvitationOf(
  wedding: WeddingDocument,
  household: Pick<HouseholdDocument, 'displayName' | 'members' | 'invitedEvents' | 'rsvps'> &
    Partial<Pick<HouseholdDocument, 'email' | 'remindersOptOut'>>,
  now: Date,
  allEvents?: boolean,
): Promise<PublicInvitation> {
  const events = await listWeddingEvents(trustWeddingId(wedding._id));
  const media = await mediaOf(wedding);
  const state = rsvpState(wedding, now);
  const invited = allEvents
    ? events.map((e) => ({ eventId: e.id, headcount: 3 }))
    : household.invitedEvents.map((e) => ({
        eventId: e.eventId.toHexString(),
        headcount: e.headcount,
      }));
  return {
    wedding: {
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      weddingDate: wedding.weddingDate,
      city: wedding.city,
      venue: wedding.venue ?? '',
    },
    household: { displayName: household.displayName, members: household.members },
    invitation: {
      media: media ? { type: media.type, url: media.url } : null,
      message: wedding.invitation.message,
    },
    rsvpDeadline: wedding.invitation.rsvpDeadline,
    rsvpOpen: state.open,
    closedReason: state.closedReason,
    canStopReminders: Boolean(household.email) && !household.remindersOptOut && state.open,
    events: toPublicEvents(events, invited, household.rsvps),
    // The public website arrives with its own feature.
    websiteUrl: null,
  };
}

/** The family and wedding behind a link; LINK_INVALID for an unknown or regenerated link. */
async function resolveLink(token: string) {
  const found = await findInvitationHousehold(token);
  if (!found) throw new AppError('LINK_INVALID');
  const wedding = await getWeddingRecord(found.weddingId);
  if (!wedding) throw new AppError('LINK_INVALID');
  return { ...found, wedding };
}

/** GET /api/public/invitations/{token} (api-spec §11.1). Read-only: it never marks "opened". */
export async function getGuestInvitation(token: string, now = new Date()) {
  await enforceRateLimits(
    [{ key: `invite:view:${linkKey(token)}`, limit: 60, windowMs: MINUTE }],
    now,
  );
  const { household, wedding } = await resolveLink(token);
  return publicInvitationOf(wedding, household, now);
}

/** For the server-rendered guest page: the invitation, or why it can't be shown. */
export async function getGuestInvitationPage(
  token: string,
): Promise<{ kind: 'ok'; invitation: PublicInvitation } | { kind: 'invalid' } | { kind: 'busy' }> {
  try {
    return { kind: 'ok', invitation: await getGuestInvitation(token) };
  } catch (error) {
    if (error instanceof AppError && error.code === 'LINK_INVALID') return { kind: 'invalid' };
    if (error instanceof AppError && error.code === 'RATE_LIMITED') return { kind: 'busy' };
    throw error;
  }
}

/**
 * The guest page as a sample family would see it, for the couple's "Preview" (every event, up to
 * 3 people each). Replies there are never saved.
 */
export async function getInvitationPreview(
  token: string | undefined,
  weddingId: ObjectId,
  now = new Date(),
): Promise<PublicInvitation> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await weddingOf(context.weddingId);
  return publicInvitationOf(
    wedding,
    {
      displayName: 'Sharma family',
      members: [{ name: 'Rajesh' }, { name: 'Sunita' }, { name: 'Aarav' }],
      invitedEvents: [],
      rsvps: [],
    },
    now,
    true,
  );
}

/**
 * The preview for the server-rendered page `/app/{weddingId}/invitations/preview`, read with the
 * session cookie. The wedding layout has already checked membership.
 */
export async function getPageInvitationPreview(weddingId: string): Promise<PublicInvitation> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return getInvitationPreview(token || undefined, toObjectId(weddingId));
}

function replyLine(event: PublicInvitationEvent): string {
  const when = `${event.name} · ${formatDate(event.date)}`;
  if (!event.rsvp) return when;
  return event.rsvp.status === 'attending'
    ? `${when}: Attending (${event.rsvp.attendingCount})`
    : `${when}: Not attending`;
}

/**
 * PUT /api/public/invitations/{token}/rsvp (api-spec §11.2): save replies for one or more
 * events. Closed after the deadline or when the wedding is archived. A confirmation email goes
 * to the family if it has an address; its failure never fails the reply.
 */
export async function replyToInvitation(
  token: string,
  input: GuestRsvpInput,
  now = new Date(),
): Promise<PublicInvitation> {
  await enforceRateLimits(
    [{ key: `invite:rsvp:${linkKey(token)}`, limit: 10, windowMs: MINUTE }],
    now,
  );
  let household: HouseholdDocument;
  try {
    household = await saveGuestRsvps(
      token,
      input.responses,
      (wedding) => {
        if (!rsvpState(wedding, now).open) throw new AppError('RSVP_CLOSED');
      },
      now,
    );
  } catch (error) {
    // The wedding was archived a moment ago.
    if (error instanceof AppError && error.code === 'WEDDING_ARCHIVED') {
      throw new AppError('RSVP_CLOSED');
    }
    throw error;
  }
  const wedding = await getWeddingRecord(trustWeddingId(household.weddingId));
  if (!wedding) throw new AppError('LINK_INVALID');
  const invitation = await publicInvitationOf(wedding, household, now);

  if (household.email) {
    const coupleNames = coupleNamesOf(wedding);
    await sendEmail(
      {
        template: 'rsvp_confirmation',
        to: household.email,
        subject: `Your reply to ${coupleNames}`,
        body: createElement(RsvpConfirmationEmail, {
          coupleNames,
          familyName: household.displayName,
          lines: invitation.events.filter((e) => e.rsvp).map(replyLine),
          waiting: invitation.events.filter((e) => !e.rsvp).length,
          pageUrl: inviteLinkOf(household.token),
        }),
        fromName: coupleNames,
        weddingId: wedding._id,
        householdId: household._id,
      },
      now,
    );
  }
  return invitation;
}

/**
 * POST /api/public/invitations/{token}/opened (api-spec §11.5): called by the guest page once it
 * has loaded in a browser. Known bots and link previews are accepted but ignored.
 */
export async function recordInvitationOpened(
  token: string,
  userAgent: string | null,
  now = new Date(),
): Promise<void> {
  await enforceRateLimits(
    [{ key: `invite:view:${linkKey(token)}`, limit: 60, windowMs: MINUTE }],
    now,
  );
  if (!userAgent || BOT_AGENT.test(userAgent)) {
    // Still a 404 for an unknown link, so the endpoint can't be used to test links.
    if (!(await findInvitationHousehold(token))) throw new AppError('LINK_INVALID');
    return;
  }
  await markInvitationOpened(token, now);
}

/** POST /api/public/invitations/{token}/stop-reminders (api-spec §11.4). */
export async function stopReminders(token: string, now = new Date()): Promise<void> {
  await enforceRateLimits(
    [{ key: `invite:rsvp:${linkKey(token)}`, limit: 10, windowMs: MINUTE }],
    now,
  );
  await stopInvitationReminders(token, now);
}

const icsText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const icsTime = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Long lines are folded at 75 characters, as calendar apps expect. */
function foldLine(line: string): string {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 74) parts.push(line.slice(i, i + 74));
  return parts.join('\r\n ');
}

/**
 * GET /api/public/invitations/{token}/events/{eventId}/calendar.ics (api-spec §11.3, PRD
 * INV-15): one event the family is invited to, at its time in the wedding's timezone. Events
 * without an end time are given 3 hours; an end before the start means the next day.
 */
export async function invitationCalendar(
  token: string,
  eventId: ObjectId,
  now = new Date(),
): Promise<{ filename: string; ics: string }> {
  await enforceRateLimits(
    [{ key: `invite:view:${linkKey(token)}`, limit: 60, windowMs: MINUTE }],
    now,
  );
  const { household, wedding } = await resolveLink(token);
  if (!household.invitedEvents.some((e) => e.eventId.equals(eventId))) {
    throw new AppError('NOT_FOUND');
  }
  const event = (await listWeddingEvents(trustWeddingId(wedding._id))).find(
    (e) => e.id === eventId.toHexString(),
  );
  if (!event) throw new AppError('NOT_FOUND');

  const start = zonedTimeToUtc(event.date, event.startTime, wedding.timezone);
  let end = event.endTime
    ? zonedTimeToUtc(event.date, event.endTime, wedding.timezone)
    : new Date(start.getTime() + 3 * 60 * MINUTE);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * MINUTE);

  const coupleNames = coupleNamesOf(wedding);
  const location = [event.venueName, event.address].filter(Boolean).join(', ');
  const description = [
    `${coupleNames}'s wedding`,
    event.dressCode ? `Dress code: ${event.dressCode}` : '',
    event.notes,
    event.mapUrl ? `Map: ${event.mapUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${APP_NAME}//Invitation//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@invitation`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(`${event.name} · ${coupleNames}`)}`,
    ...(location ? [`LOCATION:${icsText(location)}`] : []),
    `DESCRIPTION:${icsText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const slug = event.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return { filename: `${slug || 'event'}.ics`, ics: lines.map(foldLine).join('\r\n') + '\r\n' };
}

// Sending by email (api-spec §10.4–10.7, PRD INV-6, INV-7, INV-18): families are chosen and
// queued in one transaction; the job queue sends them a few at a time within the daily limit.

const JOB_TYPES = ['invitation.send', 'rsvp.remind'] as const;

function newBatchId(kind: 'send' | 'remind', now: Date): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `${kind}_${day}_${randomToken(6)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '0')}`;
}

/** Days a send of `count` emails takes at the daily limit: 1 means it all goes today. */
async function estimateDays(count: number, now: Date): Promise<number> {
  if (count === 0) return 0;
  const { remaining } = await dailyEmailsLeft(now);
  if (count <= remaining) return 1;
  return 1 + Math.ceil((count - remaining) / getEnv().EMAIL_DAILY_LIMIT);
}

async function queueEmails(
  token: string | undefined,
  weddingId: ObjectId,
  kind: 'invite' | 'remind',
  selection: { householdIds: string[] } | { filter: string },
  options: { resend?: boolean; dryRun: boolean },
  now: Date,
): Promise<SendResult> {
  let batchId: string | null = null;
  const chosen = await chooseFamiliesToEmail(
    token,
    weddingId,
    kind,
    selection,
    {
      ...options,
      // Reminders don't change the invite status, so check the queue for one already waiting.
      pending:
        kind === 'remind'
          ? (id, session) => familiesWithPendingJobs(id, 'rsvp.remind', session)
          : undefined,
    },
    async ({ weddingId: id, chosen: families, session }) => {
      batchId = newBatchId(kind === 'invite' ? 'send' : 'remind', now);
      await enqueueJobs(
        id,
        batchId,
        families.families.map((doc) => ({
          type: kind === 'invite' ? 'invitation.send' : 'rsvp.remind',
          // The side lets a side-limited Manager see and cancel only their own families.
          payload: {
            householdId: doc._id,
            previousStatus: doc.inviteStatus,
            side: doc.side,
          },
          idempotencyKey: `${kind}:${doc._id.toHexString()}:${batchId}`,
        })),
        session,
        now,
      );
    },
    now,
  );
  return {
    batchId,
    queued: chosen.families.length,
    skippedNoEmail: chosen.skippedNoEmail,
    skippedAlreadySent: chosen.skippedAlreadySent,
    skippedQueued: chosen.skippedQueued,
    skippedNoEvents: chosen.skippedNoEvents,
    skippedNotNeeded: chosen.skippedNotNeeded,
    estimatedDays: await estimateDays(chosen.families.length, now),
  };
}

/**
 * POST /api/weddings/{weddingId}/invitation/send (api-spec §10.4): email the invitation to the
 * chosen families, or count them with `dryRun`. Needs a card or a message.
 */
export async function sendInvitations(
  token: string | undefined,
  weddingId: ObjectId,
  input: SendInvitationsInput,
  now = new Date(),
): Promise<SendResult> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await weddingOf(context.weddingId);
  if (!wedding.invitation.mediaKey && !wedding.invitation.message) {
    throw new AppError('INVITATION_NOT_READY');
  }
  const result = await queueEmails(
    token,
    weddingId,
    'invite',
    'householdIds' in input ? { householdIds: input.householdIds } : { filter: input.filter },
    { resend: 'resend' in input ? input.resend : false, dryRun: input.dryRun },
    now,
  );
  if (result.batchId) {
    logger.info('invitation.send_queued', {
      weddingId: context.weddingId.toHexString(),
      batchId: result.batchId,
      queued: result.queued,
    });
  }
  return result;
}

/** POST /api/weddings/{weddingId}/invitation/remind (api-spec §10.7). */
export async function remindFamilies(
  token: string | undefined,
  weddingId: ObjectId,
  input: RemindFamiliesInput,
  now = new Date(),
): Promise<SendResult> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await weddingOf(context.weddingId);
  if (!rsvpState(wedding, now).open) throw new AppError('RSVP_CLOSED');
  const result = await queueEmails(
    token,
    weddingId,
    'remind',
    'householdIds' in input ? { householdIds: input.householdIds } : { filter: input.filter },
    { dryRun: input.dryRun },
    now,
  );
  if (result.batchId) {
    logger.info('invitation.remind_queued', {
      weddingId: context.weddingId.toHexString(),
      batchId: result.batchId,
      queued: result.queued,
    });
  }
  return result;
}

/** GET /api/weddings/{weddingId}/invitation/batches (api-spec §10.5): recent sends. */
export async function listSendBatches(
  token: string | undefined,
  weddingId: ObjectId,
  now = new Date(),
): Promise<BatchCounts[]> {
  const { context, side } = await invitationScope(token, weddingId);
  return listRecentBatches(context.weddingId, side, [...JOB_TYPES], now);
}

/** GET /api/weddings/{weddingId}/invitation/batches/{batchId} (api-spec §10.5). */
export async function getSendBatch(
  token: string | undefined,
  weddingId: ObjectId,
  batchId: string,
): Promise<BatchCounts> {
  const { context, side } = await invitationScope(token, weddingId);
  const batch = await getBatch(context.weddingId, side, batchId, [...JOB_TYPES]);
  if (!batch) throw new AppError('NOT_FOUND');
  return batch;
}

/**
 * POST /api/weddings/{weddingId}/invitation/batches/{batchId}/cancel (api-spec §10.6): emails
 * not sent yet are cancelled and those families go back to their earlier status. Emails being
 * sent at that moment still go out.
 */
export async function cancelSendBatch(
  token: string | undefined,
  weddingId: ObjectId,
  batchId: string,
  now = new Date(),
): Promise<BatchCounts> {
  await withInvitationScope(token, weddingId, async ({ weddingId: id, side, session }) => {
    const cancelled = await cancelBatchJobs(id, side, batchId, session, now);
    const invitations = cancelled.filter((job) => job.type === 'invitation.send');
    await restoreQueuedFamilies(
      id,
      invitations.map((job) => ({
        householdId: job.payload.householdId as ObjectId,
        previousStatus: job.payload.previousStatus as HouseholdDocument['inviteStatus'],
      })),
      session,
      now,
    );
  });
  return getSendBatch(token, weddingId, batchId);
}

/** The card for emails: a stable address that always redirects to a fresh image link. */
const cardUrlOf = (token: string) =>
  new URL(`/api/public/invitations/${token}/card`, getEnv().APP_URL).toString();

/**
 * GET /api/public/invitations/{token}/card: the invitation card image for emails, which may be
 * opened weeks later, long after a signed link would have expired. It doesn't count as opened.
 */
export async function invitationCardUrl(token: string, now = new Date()): Promise<string> {
  await enforceRateLimits(
    [{ key: `invite:view:${linkKey(token)}`, limit: 60, windowMs: MINUTE }],
    now,
  );
  const { wedding } = await resolveLink(token);
  const media = await mediaOf(wedding);
  if (!media) throw new AppError('NOT_FOUND');
  return media.url;
}

/** The family and wedding for an email job, or why the email shouldn't go. */
async function jobContext(job: JobDocument) {
  if (!job.weddingId) throw new PermanentJobError('Job has no wedding');
  const weddingId = trustWeddingId(job.weddingId);
  const household = await getFamilyForEmail(weddingId, job.payload.householdId as ObjectId);
  const wedding = await getWeddingRecord(weddingId);
  return { weddingId, household, wedding };
}

/** The email a job sends, saved on its first attempt so every retry sends exactly the same. */
interface JobEmail<P> {
  to: string;
  subject: string;
  fromName: string;
  props: P;
}

/**
 * Send a job's email: on the first attempt `build` decides it and it's remembered; a retry sends
 * the remembered one, even if the family or the invitation changed meanwhile, so the provider's
 * idempotency key always belongs to the same email. Today's email limit defers the job.
 */
async function sendJobEmail<P extends object>(
  job: JobDocument,
  tools: JobRunTools,
  template: 'invitation' | 'rsvp_reminder',
  render: (props: P) => ReactElement,
  build: () => JobEmail<P>,
  ids: { weddingId: WeddingId; householdId: ObjectId },
): Promise<void> {
  let email = job.sent as JobEmail<P> | null | undefined;
  if (!email) {
    email = build();
    await tools.remember(email as unknown as Record<string, unknown>);
  }
  try {
    await sendQueuedEmail({
      template,
      to: email.to,
      subject: email.subject,
      body: render(email.props),
      fromName: email.fromName,
      weddingId: ids.weddingId,
      householdId: ids.householdId,
      jobId: job._id,
      idempotencyKey: job.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof DailyEmailLimitError) throw new DeferJobError(error.resetAt);
    throw error;
  }
}

/** Handlers for the job queue, run by the cron route (api-spec §21.1). */
export const invitationJobHandlers: JobHandlers = {
  'invitation.send': {
    async run(job, tools) {
      const { weddingId, household, wedding } = await jobContext(job);
      // Deleted, or no longer waiting (e.g. the send was cancelled): nothing to send.
      if (!household || !wedding || household.inviteStatus !== 'queued') return 'skipped';
      if (wedding.status === 'archived') throw new PermanentJobError('Wedding archived');
      if (!household.email && !job.sent) throw new PermanentJobError('Family has no email');
      const email = household.email!;
      await sendJobEmail(
        job,
        tools,
        'invitation',
        (props: InvitationEmailProps) => createElement(InvitationEmail, props),
        () => {
          const coupleNames = coupleNamesOf(wedding);
          return {
            to: email,
            subject: `${coupleNames} invite you to their wedding`,
            fromName: coupleNames,
            props: {
              coupleNames,
              familyName: household.displayName,
              message: wedding.invitation.message,
              imageUrl: wedding.invitation.mediaKey ? cardUrlOf(household.token) : undefined,
              deadlineLine: deadlineLine(wedding.invitation.rsvpDeadline),
              buttonUrl: inviteLinkOf(household.token),
            },
          };
        },
        { weddingId, householdId: household._id },
      );
      await recordInvitationEmailed(weddingId, household._id);
      return 'done';
    },
    async onFailed(job) {
      if (!job.weddingId) return;
      await recordInvitationEmailFailed(
        trustWeddingId(job.weddingId),
        job.payload.householdId as ObjectId,
      );
    },
  },
  'rsvp.remind': {
    async run(job, tools) {
      const { weddingId, household, wedding } = await jobContext(job);
      // Replied meanwhile, turned reminders off, or replies have closed: no reminder. A retry
      // of a reminder already attempted goes ahead, so the same email is never changed.
      if (
        !household ||
        !wedding ||
        (!job.sent &&
          (!household.email ||
            household.responseStatus === 'complete' ||
            household.remindersOptOut ||
            !rsvpState(wedding, new Date()).open))
      ) {
        return 'skipped';
      }
      const email = household.email;
      const events = await listWeddingEvents(weddingId);
      await sendJobEmail(
        job,
        tools,
        'rsvp_reminder',
        (props: RsvpReminderEmailProps) => createElement(RsvpReminderEmail, props),
        () => {
          const coupleNames = coupleNamesOf(wedding);
          const pageUrl = inviteLinkOf(household.token);
          return {
            to: email!,
            subject: `Reminder: will you join ${coupleNames}?`,
            fromName: coupleNames,
            props: {
              coupleNames,
              familyName: household.displayName,
              waiting: events
                .filter(
                  (e) =>
                    household.invitedEvents.some((i) => i.eventId.toHexString() === e.id) &&
                    !household.rsvps.some((r) => r.eventId.toHexString() === e.id),
                )
                .map((e) => `${e.name} · ${formatDate(e.date)}`),
              deadlineLine: deadlineLine(wedding.invitation.rsvpDeadline),
              pageUrl,
              stopUrl: `${pageUrl}#stop-reminders`,
            },
          };
        },
        { weddingId, householdId: household._id },
      );
      await recordReminded(weddingId, household._id);
      return 'done';
    },
  },
};
