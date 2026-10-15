import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WeddingSite } from '@/features/website/components/site/wedding-site';
import { getSitePreview } from '@/modules/website';

// The website as it is now, published or not, for the wedding's own team (PRD WEB-4). Anyone
// else gets the same 404 as an unknown address. `?embed=1` hides the banner for the editor's
// live preview.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Website preview',
  robots: { index: false, follow: false },
};

export default async function Page({ params, searchParams }: PageProps<'/w/[slug]/preview'>) {
  const preview = await getSitePreview((await params).slug);
  if (!preview) notFound();
  const embed = (await searchParams).embed === '1';
  return (
    <WeddingSite
      site={preview.site}
      preview={
        embed
          ? undefined
          : { editorHref: `/app/${preview.weddingId}/website`, published: preview.published }
      }
    />
  );
}
