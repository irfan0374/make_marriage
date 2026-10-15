import type { Metadata } from 'next';
import { VendorsPage } from '@/features/vendors/components/vendors-page';
import { getPageWedding } from '@/modules/weddings';

export async function generateMetadata({
  params,
}: PageProps<'/app/[weddingId]/vendors'>): Promise<Metadata> {
  const wedding = await getPageWedding((await params).weddingId);
  // The layout handles the not-found and logged-out cases; this only names the tab.
  if (!wedding || wedding === 'unauthenticated') return {};
  return { title: `Vendors · ${wedding.brideName} & ${wedding.groomName}` };
}

export default async function Page({ params }: PageProps<'/app/[weddingId]/vendors'>) {
  const { weddingId } = await params;
  return <VendorsPage weddingId={weddingId} />;
}
