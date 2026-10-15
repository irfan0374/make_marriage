import 'server-only';
import { unstable_cache } from 'next/cache';
import { getPublicSite, siteCacheTag } from './website.service';
import type { PublicSite } from './website.types';

// Public API of the website module: the couple's settings (api-spec §17) and the public page
// (api-spec §18).
export {
  changeSlugHandler,
  checkSlugHandler,
  getPublicSiteHandler,
  getWebsiteHandler,
  publishWebsiteHandler,
  siteImageHandler,
  unpublishWebsiteHandler,
  updateWebsiteHandler,
} from './website.handlers';
export { getSitePreview } from './website.service';
export type { PublicSite } from './website.types';

/**
 * The published site for `/w/{slug}`, cached for a minute and refreshed at once when the couple
 * saves (architecture §11). `null` for an unknown or unpublished address.
 */
export function getCachedPublicSite(slug: string): Promise<PublicSite | null> {
  return unstable_cache(() => getPublicSite(slug), ['public-site', slug], {
    tags: [siteCacheTag(slug)],
    revalidate: 60,
  })();
}
