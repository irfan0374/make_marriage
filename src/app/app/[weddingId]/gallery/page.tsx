import type { Metadata } from 'next';
import { GalleryPage } from '@/features/gallery/components/gallery-page';
import { getPageWedding } from '@/modules/weddings';

export async function generateMetadata({
  params,
}: PageProps<'/app/[weddingId]/gallery'>): Promise<Metadata> {
  const wedding = await getPageWedding((await params).weddingId);
  // The layout handles the not-found and logged-out cases; this only names the tab.
  if (!wedding || wedding === 'unauthenticated') return {};
  return { title: `Photo Gallery · ${wedding.brideName} & ${wedding.groomName}` };
}

export default async function Page({ params }: PageProps<'/app/[weddingId]/gallery'>) {
  const { weddingId } = await params;
  return <GalleryPage weddingId={weddingId} />;
}
