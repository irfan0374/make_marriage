import 'server-only';
import type { ObjectId } from 'mongodb';
import { revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/config/app';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { trustWeddingId, type WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { recordAudit } from '@/modules/audit';
import { listWeddingEvents } from '@/modules/events';
import { fileViewUrl, removeFile, verifyUploadedFile } from '@/modules/files';
import { requireAdmin, resolveWeddingContext } from '@/modules/members';
import {
  getWeddingBySlug,
  getWeddingRecord,
  isSlugAvailable,
  requireWritableWedding,
  saveWebsiteFields,
  suggestFreeSlug,
  type WeddingDocument,
} from '@/modules/weddings';
import { formatFullDate } from '@/shared/dates';
import { isReservedSlug, suggestSlug } from '@/shared/slug';
import { accentOf, slugSchema, youTubeVideoId, WEBSITE_SECTIONS } from './website.schemas';
import type {
  ChangeSlugInput,
  PublicSite,
  SlugCheck,
  UpdateWebsiteInput,
  WebsiteSettings,
} from './website.types';

// Wedding website and live stream (PRD §5.9, api-spec §17–18). Settings live on the wedding
// record; the public page `/w/{slug}` is built from them, cached, and refreshed on every save.

type Website = WeddingDocument['website'];

/** Cache tag of the public page at `/w/{slug}`. */
export const siteCacheTag = (slug: string) => `site:${slug}`;

/** Refresh the cached public pages now. Outside a Next.js request (tests, scripts) there is none. */
export function refreshSites(slugs: (string | null)[]): void {
  for (const slug of new Set(slugs)) {
    if (!slug) continue;
    try {
      revalidateTag(siteCacheTag(slug), { expire: 0 });
    } catch (error) {
      logger.debug('website.revalidate_skipped', { err: error });
    }
  }
}

const absolute = (path: string) => new URL(path, getEnv().APP_URL).toString();
const siteUrlOf = (slug: string) => absolute(`/w/${slug}`);
const fileNameOf = (key: string) => key.slice(key.lastIndexOf('/') + 1);
/** A stable image address for the public page that redirects to a fresh signed link. */
const imageUrlOf = (slug: string, key: string) =>
  absolute(`/api/public/sites/${slug}/images/${fileNameOf(key)}`);

/** The address, giving a wedding that has none (very early test data) its suggested one. */
async function ensureSlug(wedding: WeddingDocument): Promise<WeddingDocument> {
  if (wedding.website.slug) return wedding;
  const weddingId = trustWeddingId(wedding._id);
  const slug = await suggestFreeSlug(
    suggestSlug(wedding.brideName, wedding.groomName, wedding.weddingDate),
  );
  try {
    return await saveWebsiteFields(weddingId, { slug }, { slug: null });
  } catch (error) {
    // Someone else gave it an address a moment ago: use theirs.
    if (error instanceof AppError && error.code === 'CONFLICT') {
      return (await getWeddingRecord(weddingId)) ?? wedding;
    }
    throw error;
  }
}

async function settingsOf(wedding: WeddingDocument): Promise<WebsiteSettings> {
  const w = wedding.website;
  const slug = w.slug ?? '';
  const [cover, photos] = await Promise.all([
    w.coverKey ? fileViewUrl(w.coverKey).then((url) => ({ key: w.coverKey!, url })) : null,
    Promise.all(w.photoKeys.map(async (key) => ({ key, url: await fileViewUrl(key) }))),
  ]);
  return {
    slug,
    url: siteUrlOf(slug),
    published: w.published,
    publishedAt: w.publishedAt?.toISOString() ?? null,
    theme: w.theme,
    accentColor: accentOf(w.accentColor),
    sections: Object.fromEntries(
      WEBSITE_SECTIONS.map((s) => [s, w.sections[s] ?? true]),
    ) as WebsiteSettings['sections'],
    story: w.story,
    cover,
    photos,
    liveStream: w.liveStream && {
      url: w.liveStream.url,
      videoId: w.liveStream.videoId,
      startsAt: w.liveStream.startsAt?.toISOString() ?? null,
      enabled: w.liveStream.enabled,
    },
    indexable: w.indexable,
  };
}

/** GET /api/weddings/{weddingId}/website (api-spec §17.1). */
export async function getWebsite(
  token: string | undefined,
  weddingId: ObjectId,
): Promise<WebsiteSettings> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await getWeddingRecord(context.weddingId);
  if (!wedding) throw new AppError('NOT_FOUND');
  return settingsOf(wedding.status === 'active' ? await ensureSlug(wedding) : wedding);
}

/**
 * Save only the changed fields (`expected` must still hold, see `saveWebsiteFields`), refresh
 * the public page, then delete the images this save took off the site. Images still used by the
 * saved site (as cover or photo) are never deleted.
 */
async function save(
  weddingId: WeddingId,
  before: Website,
  changes: Record<string, unknown>,
  expected: Record<string, unknown>,
  now: Date,
): Promise<WeddingDocument> {
  const updated = await saveWebsiteFields(weddingId, changes, expected, now);
  const after = updated.website;
  // An old address stops showing the site at once too.
  refreshSites([before.slug, after.slug]);
  const kept = new Set([after.coverKey, ...after.photoKeys]);
  const dropped = [
    'coverKey' in changes ? before.coverKey : null,
    ...('photoKeys' in changes ? before.photoKeys : []),
  ].filter((key): key is string => !!key && !kept.has(key));
  await Promise.all(dropped.map(removeFile));
  return updated;
}

/**
 * PATCH /api/weddings/{weddingId}/website (api-spec §17.2). Any member edits the content; only
 * Admins turn search-engine indexing on or off. New images must be this wedding's uploads.
 * Only the fields sent are written, so this never undoes a publish, an address change or another
 * person's edit to other fields. Image lists are compare-and-set: if someone else changed the
 * cover or photos since this person loaded them, the save is refused (409 CONFLICT).
 */
export async function updateWebsite(
  token: string | undefined,
  weddingId: ObjectId,
  input: UpdateWebsiteInput,
  now = new Date(),
): Promise<WebsiteSettings> {
  const context = await resolveWeddingContext(token, weddingId);
  if (input.indexable !== undefined) requireAdmin(context);
  const wedding = await requireWritableWedding(context.weddingId);
  const before = wedding.website;
  const changes: Record<string, unknown> = {};
  const expected: Record<string, unknown> = {};

  if (input.theme !== undefined) changes.theme = input.theme;
  if (input.accentColor !== undefined) changes.accentColor = input.accentColor;
  for (const [section, on] of Object.entries(input.sections ?? {})) {
    changes[`sections.${section}`] = on;
  }
  if (input.story !== undefined) changes.story = input.story;
  if (input.indexable !== undefined) changes.indexable = input.indexable;

  if (input.coverKey !== undefined && input.coverKey !== before.coverKey) {
    changes.coverKey = input.coverKey
      ? (await verifyUploadedFile(context.weddingId, 'website_cover', input.coverKey)).key
      : null;
    expected.coverKey = before.coverKey;
  }
  if (input.photoKeys !== undefined) {
    const known = new Set(before.photoKeys);
    for (const key of input.photoKeys) {
      if (!known.has(key)) await verifyUploadedFile(context.weddingId, 'website_photo', key);
    }
    changes.photoKeys = input.photoKeys;
    expected.photoKeys = before.photoKeys;
  }
  if (input.liveStream !== undefined) {
    if (input.liveStream === null) {
      changes.liveStream = null;
    } else {
      const videoId = youTubeVideoId(input.liveStream.url);
      if (!videoId) throw new AppError('INVALID_YOUTUBE_URL');
      changes.liveStream = {
        url: input.liveStream.url,
        videoId,
        startsAt: input.liveStream.startsAt ? new Date(input.liveStream.startsAt) : null,
        enabled: input.liveStream.enabled,
      };
    }
  }

  if (Object.keys(changes).length === 0) return settingsOf(wedding);
  return settingsOf(await save(context.weddingId, before, changes, expected, now));
}

/** GET /api/weddings/{weddingId}/website/slug-check (api-spec §17.3). Admins only. */
export async function checkSlug(
  token: string | undefined,
  weddingId: ObjectId,
  raw: string,
): Promise<SlugCheck> {
  const context = await resolveWeddingContext(token, weddingId);
  requireAdmin(context);
  const parsed = slugSchema.safeParse(raw);
  if (!parsed.success) {
    return { slug: raw, available: false, reason: 'invalid', suggestion: null };
  }
  const slug = parsed.data;
  if (isReservedSlug(slug)) {
    return { slug, available: false, reason: 'reserved', suggestion: null };
  }
  if (await isSlugAvailable(slug, context.weddingId)) {
    return { slug, available: true, reason: null, suggestion: null };
  }
  return { slug, available: false, reason: 'taken', suggestion: await suggestFreeSlug(slug) };
}

/** PUT /api/weddings/{weddingId}/website/slug (api-spec §17.4). Admins only. */
export async function changeSlug(
  token: string | undefined,
  weddingId: ObjectId,
  input: ChangeSlugInput,
  now = new Date(),
): Promise<WebsiteSettings> {
  const context = await resolveWeddingContext(token, weddingId);
  requireAdmin(context);
  const wedding = await requireWritableWedding(context.weddingId);
  if (isReservedSlug(input.slug)) throw new AppError('SLUG_RESERVED');
  if (input.slug === wedding.website.slug) return settingsOf(wedding);
  if (!(await isSlugAvailable(input.slug, context.weddingId))) throw new AppError('SLUG_TAKEN');
  const before = wedding.website;
  return settingsOf(
    await save(context.weddingId, before, { slug: input.slug }, { slug: before.slug }, now),
  );
}

/** POST /api/weddings/{weddingId}/website/publish and /unpublish (api-spec §17.5). Admins only. */
export async function setPublished(
  token: string | undefined,
  weddingId: ObjectId,
  published: boolean,
  now = new Date(),
): Promise<WebsiteSettings> {
  const context = await resolveWeddingContext(token, weddingId);
  requireAdmin(context);
  const wedding = await ensureSlug(await requireWritableWedding(context.weddingId));
  const before = wedding.website;
  if (before.published === published) return settingsOf(wedding);
  let updated: WeddingDocument;
  try {
    updated = await save(
      context.weddingId,
      before,
      published ? { published, publishedAt: now } : { published },
      { published: !published },
      now,
    );
  } catch (error) {
    // The other Admin did the same a moment ago: nothing more to do.
    if (error instanceof AppError && error.code === 'CONFLICT') {
      return settingsOf(await requireWritableWedding(context.weddingId));
    }
    throw error;
  }
  await recordAudit(context.weddingId, {
    actor: { type: 'user', userId: context.userId },
    action: published ? 'website.published' : 'website.unpublished',
    targetType: 'wedding',
    targetId: context.weddingId,
  });
  return settingsOf(updated);
}

/** The public page's content, as anyone with the link sees it (api-spec §18.1). */
async function siteOf(wedding: WeddingDocument): Promise<PublicSite> {
  const w = wedding.website;
  const slug = w.slug ?? '';
  const on = (s: (typeof WEBSITE_SECTIONS)[number]) => w.sections[s] ?? true;
  const coverUrl = w.coverKey ? imageUrlOf(slug, w.coverKey) : null;
  const events = on('events')
    ? (await listWeddingEvents(trustWeddingId(wedding._id)))
        .filter((e) => e.showOnWebsite)
        .map((e) => ({
          name: e.name,
          date: e.date,
          startTime: e.startTime,
          endTime: e.endTime,
          venueName: e.venueName,
          address: e.address,
          mapUrl: e.mapUrl,
          dressCode: e.dressCode,
          highlight: e.presetKey === 'wedding',
        }))
    : null;
  const couple = `${wedding.brideName} & ${wedding.groomName}`;
  return {
    slug,
    url: siteUrlOf(slug),
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    weddingDate: wedding.weddingDate,
    city: wedding.city,
    timezone: wedding.timezone,
    theme: w.theme,
    accentColor: accentOf(w.accentColor),
    hero: on('hero') ? { coverUrl } : null,
    story: on('story') && w.story ? w.story : null,
    events,
    photoUrls:
      on('photos') && w.photoKeys.length > 0 ? w.photoKeys.map((k) => imageUrlOf(slug, k)) : null,
    liveStream:
      on('liveStream') && w.liveStream?.enabled
        ? { videoId: w.liveStream.videoId, startsAt: w.liveStream.startsAt?.toISOString() ?? null }
        : null,
    // The guests' gallery link (PRD WEB-3); a new link shows here once the page refreshes.
    galleryUrl: on('gallery') ? absolute(`/gallery/${wedding.gallery.token}`) : null,
    indexable: w.indexable,
    og: {
      title: `${couple} · ${formatFullDate(wedding.weddingDate)}`,
      description: wedding.city ? `Join us in ${wedding.city}` : `Join us to celebrate`,
      imageUrl: coverUrl,
    },
  };
}

/**
 * The published website at `/w/{slug}`, or `null` (unknown or unpublished: both a 404, PRD
 * WEB-4). Archived weddings stay viewable.
 */
export async function getPublicSite(slug: string): Promise<PublicSite | null> {
  const wedding = await getWeddingBySlug(slug);
  if (!wedding?.website.published) return null;
  return siteOf(wedding);
}

/** GET /api/public/sites/{slug} (api-spec §18.1). */
export async function getPublicSiteOrThrow(slug: string): Promise<PublicSite> {
  const site = await getPublicSite(slug);
  if (!site) throw new AppError('NOT_FOUND');
  return site;
}

/** The page's session token, if any (server-rendered preview and images). */
async function pageSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value || undefined;
}

/**
 * `/w/{slug}/preview`: the site as it is now, published or not, for the wedding's own team
 * (PRD WEB-4). `null` for anyone else, as for an unknown address.
 */
export async function getSitePreview(
  slug: string,
): Promise<{ site: PublicSite; published: boolean; weddingId: string } | null> {
  const wedding = await getWeddingBySlug(slug);
  if (!wedding) return null;
  if (!(await isTeamMember(await pageSessionToken(), wedding._id))) return null;
  return {
    site: await siteOf(wedding),
    published: wedding.website.published,
    weddingId: wedding._id.toHexString(),
  };
}

/**
 * GET /api/public/sites/{slug}/images/{file}: a fresh signed link to the cover or one of the
 * photos. Anyone may open a published site's images; an unpublished site's only its team.
 */
export async function siteImageUrl(
  token: string | undefined,
  slug: string,
  file: string,
): Promise<string> {
  const wedding = await getWeddingBySlug(slug);
  if (!wedding) throw new AppError('NOT_FOUND');
  if (!wedding.website.published && !(await isTeamMember(token, wedding._id))) {
    throw new AppError('NOT_FOUND');
  }
  const w = wedding.website;
  const key = [w.coverKey, ...w.photoKeys].find((k) => k && fileNameOf(k) === file);
  if (!key) throw new AppError('NOT_FOUND');
  return fileViewUrl(key);
}

/** Whether the session belongs to a member of this wedding. */
async function isTeamMember(token: string | undefined, weddingId: ObjectId): Promise<boolean> {
  if (!token) return false;
  try {
    await resolveWeddingContext(token, weddingId);
    return true;
  } catch (error) {
    if (error instanceof AppError && ['UNAUTHENTICATED', 'NOT_FOUND'].includes(error.code)) {
      return false;
    }
    throw error;
  }
}
