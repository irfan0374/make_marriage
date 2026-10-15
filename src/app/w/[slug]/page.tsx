import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WeddingSite } from '@/features/website/components/site/wedding-site';
import { getCachedPublicSite } from '@/modules/website';

// The public wedding website (architecture §11, PRD §5.9). Cached and refreshed when the couple
// saves; unknown and unpublished addresses are both a 404. Hidden from search engines unless the
// couple opts in.

export async function generateMetadata({ params }: PageProps<'/w/[slug]'>): Promise<Metadata> {
  const site = await getCachedPublicSite((await params).slug);
  if (!site) return { title: 'Website not available', robots: { index: false, follow: false } };
  return {
    title: { absolute: site.og.title },
    description: site.og.description,
    robots: site.indexable ? undefined : { index: false, follow: false },
    openGraph: {
      title: site.og.title,
      description: site.og.description,
      url: site.url,
      type: 'website',
      images: site.og.imageUrl ? [{ url: site.og.imageUrl }] : undefined,
    },
  };
}

export default async function Page({ params }: PageProps<'/w/[slug]'>) {
  const site = await getCachedPublicSite((await params).slug);
  if (!site) notFound();
  return <WeddingSite site={site} />;
}
