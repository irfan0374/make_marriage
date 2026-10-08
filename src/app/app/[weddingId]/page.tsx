import type { Metadata } from 'next';
import { WeddingDashboard } from '@/features/weddings/components/wedding-dashboard';
import { getPageWedding } from '@/modules/weddings';

export async function generateMetadata({
  params,
}: PageProps<'/app/[weddingId]'>): Promise<Metadata> {
  const wedding = await getPageWedding((await params).weddingId);
  // The layout handles the not-found and logged-out cases; this only names the tab.
  if (!wedding || wedding === 'unauthenticated') return {};
  return { title: `Dashboard · ${wedding.brideName} & ${wedding.groomName}` };
}

export default async function Page({ params, searchParams }: PageProps<'/app/[weddingId]'>) {
  const { weddingId } = await params;
  // `?saved=1`: just back from Settings after saving.
  const saved = (await searchParams).saved === '1';
  return <WeddingDashboard weddingId={weddingId} saved={saved} />;
}
