import { z } from 'zod';
import { SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from '@/shared/slug';

// Client-safe: the website editor checks its fields with these same rules (api-spec §17).

export const WEBSITE_THEMES = ['classic', 'elegant', 'modern'] as const;
export type WebsiteTheme = (typeof WEBSITE_THEMES)[number];

export const THEME_LABELS: Record<WebsiteTheme, { label: string; description: string }> = {
  classic: { label: 'Classic', description: 'Centred symmetry and quiet tone' },
  elegant: { label: 'Elegant', description: 'Warm editorial paper aesthetic' },
  modern: { label: 'Modern', description: 'Crisp geometry and bold contrast' },
};

/**
 * The accent colours a couple can pick (PRD WEB-2). They are the couple's data, chosen from a
 * tested set so text on them always reads well; the public site sets the picked one as a CSS
 * variable.
 */
export const ACCENT_COLORS = [
  { value: '#4A2545', label: 'Plum' },
  { value: '#9E3D60', label: 'Rosewood' },
  { value: '#2A6F72', label: 'Deep teal' },
  { value: '#2D6A4F', label: 'Emerald' },
  { value: '#1D3557', label: 'Navy' },
  { value: '#6F4E37', label: 'Warm brown' },
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number]['value'];

export const DEFAULT_ACCENT_COLOR: AccentColor = '#4A2545';

/** A saved colour that isn't in the set (an older default) shows as the default. */
export function accentOf(color: string): AccentColor {
  return ACCENT_COLORS.find((c) => c.value === color.toUpperCase())?.value ?? DEFAULT_ACCENT_COLOR;
}

export const WEBSITE_SECTIONS = [
  'hero',
  'story',
  'events',
  'photos',
  'liveStream',
  'gallery',
] as const;
export type WebsiteSection = (typeof WEBSITE_SECTIONS)[number];

export const MAX_WEBSITE_PHOTOS = 12;
export const MAX_STORY_LENGTH = 5000;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

/**
 * The video id of a YouTube link (PRD WEB-5), or `null` if it isn't one: `youtu.be/{id}`,
 * `youtube.com/watch?v={id}`, `/live/{id}`, `/shorts/{id}` or `/embed/{id}`. Only YouTube's own
 * domains count.
 */
export function youTubeVideoId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const id =
    host === 'youtu.be'
      ? parts[0]
      : parts[0] === 'watch'
        ? url.searchParams.get('v')
        : ['live', 'shorts', 'embed'].includes(parts[0] ?? '')
          ? parts[1]
          : null;
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN, `At least ${SLUG_MIN} characters`)
  .max(SLUG_MAX, `At most ${SLUG_MAX} characters`)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens');

export const slugCheckQuerySchema = z.strictObject({ slug: z.string().trim().max(200) });
export const changeSlugSchema = z.strictObject({ slug: slugSchema });

const liveStreamSchema = z.strictObject({
  url: z.string().trim().max(500),
  /** UTC; the editor converts the wedding-time entry. `null` for a recording with no start. */
  startsAt: z.iso.datetime().nullable(),
  enabled: z.boolean(),
});

export const updateWebsiteSchema = z.strictObject({
  theme: z.enum(WEBSITE_THEMES).optional(),
  accentColor: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => ACCENT_COLORS.some((a) => a.value === c), 'Pick one of the colours')
    .optional(),
  sections: z.partialRecord(z.enum(WEBSITE_SECTIONS), z.boolean()).optional(),
  story: z
    .string()
    .trim()
    .max(MAX_STORY_LENGTH, `At most ${MAX_STORY_LENGTH} characters`)
    .optional(),
  coverKey: z.string().trim().min(1).max(300).nullable().optional(),
  photoKeys: z
    .array(z.string().trim().min(1).max(300))
    .max(MAX_WEBSITE_PHOTOS, `At most ${MAX_WEBSITE_PHOTOS} photos`)
    .refine((keys) => new Set(keys).size === keys.length, 'A photo is listed twice')
    .optional(),
  /** `null` removes the live stream. */
  liveStream: liveStreamSchema.nullable().optional(),
  indexable: z.boolean().optional(),
});
