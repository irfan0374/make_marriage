import 'server-only';
import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { SESSION_COOKIE_NAME } from '@/config/app';
import { GALLERY_STORAGE_CAP_BYTES, WEDDING_TIMEZONES } from '@/config/constants';
import { withTransaction } from '@/lib/db/transaction';
import { AppError } from '@/lib/errors';
import { toObjectId, trustWeddingId, type WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { randomToken } from '@/lib/tokens';
import { requireSession } from '@/modules/auth';
import {
  addFirstAdmin,
  getAdminWeddingId,
  listUserMemberships,
  requireAdmin,
  resolveWeddingContext,
  type WeddingContext,
} from '@/modules/members';
import { canonicalTimeZone } from '@/shared/dates';
import { isReservedSlug, slugWithSuffix, suggestSlug } from '@/shared/slug';
import { objectIdString } from '@/shared/validation';
import {
  DuplicateSlugError,
  findSlugsLike,
  findWedding,
  findWeddingSummaries,
  insertWedding,
  updateWeddingDetails,
  type WeddingDetails,
} from './weddings.repository';
import { canCheckWeddingDate, weddingDateProblem } from './weddings.schemas';
import type {
  CreateWeddingInput,
  Me,
  UpdateWeddingInput,
  Wedding,
  WeddingDocument,
  WeddingSummary,
} from './weddings.types';

// Wedding profile (architecture §4.1): create, read, edit the details, and the user's wedding list.

export const DEFAULT_INVITATION_MESSAGE =
  'With the blessings of our families, we warmly invite you and your family to celebrate our ' +
  'wedding. Your presence will make our day complete.';

const SLUG_ATTEMPTS = 3;

/** The suggested address if free, otherwise the first free `-2`, `-3`, ... (PRD WEB-1). */
async function availableSlug(base: string): Promise<string> {
  const taken = new Set(await findSlugsLike(base));
  if (!taken.has(base) && !isReservedSlug(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = slugWithSuffix(base, n);
    if (!taken.has(candidate)) return candidate;
  }
}

function newWeddingDocument(
  input: CreateWeddingInput,
  userId: ObjectId,
  slug: string,
  now: Date,
): WeddingDocument {
  return {
    _id: new ObjectId(),
    brideName: input.brideName,
    groomName: input.groomName,
    weddingDate: input.weddingDate,
    city: input.city,
    venue: input.venue,
    timezone: input.timezone,
    sidesEnabled: input.sidesEnabled,
    status: 'active',
    archivedAt: null,
    createdByUserId: userId,
    customExpenseCategories: [],
    guestTags: [],
    location: null,
    invitation: {
      mediaKey: null,
      mediaType: null,
      mediaSizeBytes: null,
      message: DEFAULT_INVITATION_MESSAGE,
      rsvpDeadline: null,
      autoRemindersEnabled: true,
    },
    website: {
      slug,
      published: false,
      publishedAt: null,
      theme: 'classic',
      accentColor: '#B4535F',
      sections: {
        hero: true,
        story: true,
        events: true,
        photos: true,
        liveStream: true,
        gallery: true,
      },
      story: '',
      coverKey: null,
      photoKeys: [],
      liveStream: null,
      indexable: false,
    },
    gallery: {
      // 16 random bytes = 128 bits, 22 URL-safe characters (database-design §7.1).
      token: randomToken(16),
      uploadsOpen: true,
      guestViewing: true,
      storageUsedBytes: 0,
      storageReservedBytes: 0,
      storageCapBytes: GALLERY_STORAGE_CAP_BYTES,
    },
    retention: { warningSentAt: null, filesDeletedAt: null },
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function toWedding(doc: WeddingDocument, context: WeddingContext): Wedding {
  return {
    id: doc._id.toHexString(),
    brideName: doc.brideName,
    groomName: doc.groomName,
    weddingDate: doc.weddingDate,
    city: doc.city,
    // Weddings created before the venue field existed have none (database-design §7.1).
    venue: doc.venue ?? '',
    // Early test weddings stored some timezones in lowercase; always show the standard spelling.
    timezone: canonicalTimeZone(
      doc.timezone,
      WEDDING_TIMEZONES.map((tz) => tz.value),
    ),
    sidesEnabled: doc.sidesEnabled,
    status: doc.status,
    archivedAt: doc.archivedAt?.toISOString() ?? null,
    location: doc.location,
    customExpenseCategories: doc.customExpenseCategories,
    guestTags: doc.guestTags,
    me: { role: context.role, sideScope: context.role === 'admin' ? 'both' : context.sideScope },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * POST /api/weddings (api-spec §6.1): create a wedding with its defaults and make the caller its
 * first admin, in one transaction (database-design §9).
 */
export async function createWedding(
  token: string | undefined,
  input: CreateWeddingInput,
  now = new Date(),
): Promise<Wedding> {
  const session = await requireSession(token, now);
  // Only the couple creates a wedding (PRD §4): an admin has theirs already (also enforced by the
  // database inside the transaction), and a Manager on any wedding team can't create one.
  await assertCanCreateWedding(session.userId);
  const base = suggestSlug(input.brideName, input.groomName, input.weddingDate);

  for (let attempt = 1; ; attempt++) {
    const doc = newWeddingDocument(input, session.userId, await availableSlug(base), now);
    const weddingId = trustWeddingId(doc._id); // A new wedding: nobody else can know this id.
    try {
      await withTransaction(async (txn) => {
        await insertWedding(doc, txn);
        await addFirstAdmin(weddingId, session.userId, now, txn);
      });
    } catch (error) {
      // Someone took the same address a moment ago: pick the next free one.
      if (error instanceof DuplicateSlugError && attempt < SLUG_ATTEMPTS) continue;
      throw error;
    }
    logger.info('wedding.created', { weddingId: weddingId.toHexString() });
    return toWedding(doc, {
      userId: session.userId,
      user: session.user,
      weddingId,
      role: 'admin',
      sideScope: 'both',
    });
  }
}

/** GET /api/weddings/{weddingId} (api-spec §6.2). Members only; anyone else gets 404. */
export async function getWedding(token: string | undefined, weddingId: ObjectId): Promise<Wedding> {
  const context = await resolveWeddingContext(token, weddingId);
  const doc = await findWedding(context.weddingId);
  if (!doc) throw new AppError('NOT_FOUND');
  return toWedding(doc, context);
}

/**
 * The wedding, if it can still be changed: archived weddings are read-only, and every write gets
 * 409 WEDDING_ARCHIVED (api-spec §3.3). Other modules call this before changing a wedding's data.
 */
export async function requireWritableWedding(weddingId: WeddingId): Promise<WeddingDocument> {
  const doc = await findWedding(weddingId);
  if (!doc) throw new AppError('NOT_FOUND');
  if (doc.status === 'archived') throw new AppError('WEDDING_ARCHIVED');
  return doc;
}

const DETAIL_FIELDS = [
  'brideName',
  'groomName',
  'weddingDate',
  'city',
  'venue',
  'timezone',
  'sidesEnabled',
] as const satisfies readonly (keyof WeddingDetails)[];

/**
 * PATCH /api/weddings/{weddingId} (api-spec §6.3): change any of the wedding's details.
 * Admins only (a Manager gets 403); archived weddings get 409. Only fields that differ from the
 * saved values are written. A new date must be from today to 5 years ahead in the wedding's
 * (new or current) timezone; a kept date is never re-checked. The website address doesn't
 * change with the names or date, so links already shared keep working.
 */
export async function updateWedding(
  token: string | undefined,
  weddingId: ObjectId,
  input: UpdateWeddingInput,
  now = new Date(),
): Promise<Wedding> {
  const context = await resolveWeddingContext(token, weddingId);
  requireAdmin(context);
  const doc = await requireWritableWedding(context.weddingId);

  const saved: WeddingDetails = { ...doc, venue: doc.venue ?? '' };
  const changes: Partial<Record<keyof WeddingDetails, unknown>> = {};
  for (const field of DETAIL_FIELDS) {
    const value = input[field];
    if (value !== undefined && value !== saved[field]) changes[field] = value;
  }

  if (typeof changes.weddingDate === 'string') {
    const timezone = (changes.timezone as string | undefined) ?? saved.timezone;
    const problem = canCheckWeddingDate(changes.weddingDate, timezone)
      ? weddingDateProblem(changes.weddingDate, timezone, now)
      : null;
    if (problem) {
      throw new AppError('VALIDATION_ERROR', undefined, {
        details: [{ path: 'weddingDate', message: problem }],
      });
    }
  }

  if (Object.keys(changes).length === 0) return toWedding(doc, context);
  const updated = await updateWeddingDetails(
    context.weddingId,
    changes as Partial<WeddingDetails>,
    now,
  );
  if (!updated) throw new AppError('WEDDING_ARCHIVED');
  logger.info('wedding.updated', {
    weddingId: context.weddingId.toHexString(),
    fields: Object.keys(changes),
  });
  return toWedding(updated, context);
}

/**
 * The wedding for a server-rendered page inside `/app/{weddingId}`, read with the session cookie.
 * `'unauthenticated'` without a valid session; `null` when the id is malformed, the wedding
 * doesn't exist or the user isn't a member (all look the same, as in the API). Cached per
 * request, so the layout, the page and its metadata share one lookup.
 */
export const getPageWedding = cache(
  async (weddingId: string): Promise<Wedding | null | 'unauthenticated'> => {
    if (!objectIdString.safeParse(weddingId).success) return null;
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    try {
      return await getWedding(token || undefined, toObjectId(weddingId));
    } catch (error) {
      if (error instanceof AppError && error.code === 'UNAUTHENTICATED') return 'unauthenticated';
      if (error instanceof AppError && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  },
);

/** GET /api/me (api-spec §5.7): the user and every wedding they belong to, soonest first. */
export async function getMe(token: string | undefined, now = new Date()): Promise<Me> {
  const session = await requireSession(token, now);
  const memberships = await listUserMemberships(session.userId);
  if (memberships.length === 0) return { user: session.user, weddings: [] };

  const roles = new Map(memberships.map((m) => [m.weddingId.toHexString(), m.role]));
  const docs = await findWeddingSummaries(memberships.map((m) => m.weddingId));
  const weddings: WeddingSummary[] = docs
    .map((doc) => ({
      id: doc._id.toHexString(),
      brideName: doc.brideName,
      groomName: doc.groomName,
      weddingDate: doc.weddingDate,
      city: doc.city,
      status: doc.status,
      myRole: roles.get(doc._id.toHexString())!,
    }))
    .sort((a, b) => a.weddingDate.localeCompare(b.weddingDate));
  return { user: session.user, weddings };
}

/**
 * Only someone on no wedding team may create a wedding (PRD §4): 409 ALREADY_HAS_WEDDING for an
 * admin (they have their own), 409 ALREADY_ON_A_TEAM for a Manager on someone's wedding.
 */
async function assertCanCreateWedding(userId: ObjectId): Promise<void> {
  if (await getAdminWeddingId(userId)) throw new AppError('ALREADY_HAS_WEDDING');
  if ((await listUserMemberships(userId)).length > 0) throw new AppError('ALREADY_ON_A_TEAM');
}

/**
 * For `/app/new`: whether the logged-in user may create a wedding, or `'unauthenticated'`.
 * Everyone else is sent to their weddings instead of the form.
 */
export async function getPageCanCreateWedding(): Promise<boolean | 'unauthenticated'> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  try {
    const session = await requireSession(token || undefined);
    await assertCanCreateWedding(session.userId);
    return true;
  } catch (error) {
    if (error instanceof AppError && error.code === 'UNAUTHENTICATED') return 'unauthenticated';
    if (
      error instanceof AppError &&
      (error.code === 'ALREADY_HAS_WEDDING' || error.code === 'ALREADY_ON_A_TEAM')
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * The couple's names, sides setting and status, for other modules that show which wedding
 * something belongs to (e.g. the join page). `null` if the wedding is gone.
 */
export async function getWeddingBasics(weddingId: WeddingId) {
  const doc = await findWedding(weddingId);
  if (!doc) return null;
  return {
    brideName: doc.brideName,
    groomName: doc.groomName,
    sidesEnabled: doc.sidesEnabled,
    status: doc.status,
    timezone: canonicalTimeZone(
      doc.timezone,
      WEDDING_TIMEZONES.map((tz) => tz.value),
    ),
  };
}
