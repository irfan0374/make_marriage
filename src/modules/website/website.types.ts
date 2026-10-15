import type { z } from 'zod';
import type {
  AccentColor,
  changeSlugSchema,
  updateWebsiteSchema,
  WebsiteSection,
  WebsiteTheme,
} from './website.schemas';

export type UpdateWebsiteInput = z.infer<typeof updateWebsiteSchema>;
export type ChangeSlugInput = z.infer<typeof changeSlugSchema>;

export interface WebsiteImage {
  key: string;
  /** A signed link valid for 1 hour. */
  url: string;
}

/** The couple's website settings (api-spec §17.1). */
export interface WebsiteSettings {
  slug: string;
  url: string;
  published: boolean;
  publishedAt: string | null;
  theme: WebsiteTheme;
  accentColor: AccentColor;
  sections: Record<WebsiteSection, boolean>;
  story: string;
  cover: WebsiteImage | null;
  photos: WebsiteImage[];
  liveStream: {
    url: string;
    videoId: string;
    startsAt: string | null;
    enabled: boolean;
  } | null;
  indexable: boolean;
}

/** GET /website/slug-check (api-spec §17.3). */
export interface SlugCheck {
  slug: string;
  available: boolean;
  /** Why it can't be used, if not. */
  reason: 'invalid' | 'reserved' | 'taken' | null;
  suggestion: string | null;
}

export interface PublicSiteEvent {
  name: string;
  date: string;
  startTime: string;
  endTime: string | null;
  venueName: string;
  address: string;
  mapUrl: string | null;
  dressCode: string;
  /** The wedding ceremony itself, shown larger on the page. */
  highlight: boolean;
}

/**
 * The public website (api-spec §18.1). Sections that are off are `null`. Images are stable
 * addresses that redirect to a fresh signed link, so a cached page never shows an expired one.
 */
export interface PublicSite {
  slug: string;
  /** The page's full address, for sharing and calendar links. */
  url: string;
  brideName: string;
  groomName: string;
  weddingDate: string;
  city: string;
  timezone: string;
  theme: WebsiteTheme;
  accentColor: AccentColor;
  hero: { coverUrl: string | null } | null;
  story: string | null;
  events: PublicSiteEvent[] | null;
  photoUrls: string[] | null;
  liveStream: { videoId: string; startsAt: string | null } | null;
  galleryUrl: string | null;
  indexable: boolean;
  og: { title: string; description: string; imageUrl: string | null };
}
