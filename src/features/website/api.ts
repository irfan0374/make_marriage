import type {
  SlugCheck,
  UpdateWebsiteInput,
  WebsiteSettings,
} from '@/modules/website/website.types';
import { apiFetch, postJson } from '@/shared/api-client';

const base = (weddingId: string) => `/api/weddings/${weddingId}/website`;

export const getWebsite = (weddingId: string) => apiFetch<WebsiteSettings>(base(weddingId));
export const updateWebsite = (weddingId: string, input: UpdateWebsiteInput) =>
  apiFetch<WebsiteSettings>(base(weddingId), { method: 'PATCH', body: JSON.stringify(input) });
export const checkSlug = (weddingId: string, slug: string) =>
  apiFetch<SlugCheck>(`${base(weddingId)}/slug-check?${new URLSearchParams({ slug }).toString()}`);
export const changeSlug = (weddingId: string, slug: string) =>
  apiFetch<WebsiteSettings>(`${base(weddingId)}/slug`, {
    method: 'PUT',
    body: JSON.stringify({ slug }),
  });
export const setPublished = (weddingId: string, published: boolean) =>
  postJson<WebsiteSettings>(`${base(weddingId)}/${published ? 'publish' : 'unpublish'}`);

/** The team's preview of the site; `embed` hides the banner for the editor's live preview. */
export const previewUrl = (slug: string, embed = false) =>
  `/w/${slug}/preview${embed ? '?embed=1' : ''}`;
