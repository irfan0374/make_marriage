import type { Metadata } from 'next';
import { WeddingOverview } from '@/features/weddings/components/wedding-overview';
import { getPageWedding } from '@/modules/weddings';

export async function generateMetadata({
  params,
}: PageProps<'/app/[weddingId]'>): Promise<Metadata> {
  const wedding = await getPageWedding((await params).weddingId);
  // The layout handles the not-found and logged-out cases; this only names the tab.
  if (!wedding || wedding === 'unauthenticated') return {};
  return { title: `${wedding.brideName} & ${wedding.groomName}` };
}

export default async function Page({ params }: PageProps<'/app/[weddingId]'>) {
  const { weddingId } = await params;
  return <WeddingOverview weddingId={weddingId} />;
}
