import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { WeddingSettings } from '@/features/weddings/components/wedding-settings';
import { getPageWedding } from '@/modules/weddings';

export async function generateMetadata({
  params,
}: PageProps<'/app/[weddingId]/settings'>): Promise<Metadata> {
  const wedding = await getPageWedding((await params).weddingId);
  if (!wedding || wedding === 'unauthenticated') return { title: 'Settings' };
  return { title: `Settings · ${wedding.brideName} & ${wedding.groomName}` };
}

// Admins only (PRD §3.2). Managers are sent back to the overview instead of seeing a form they
// can't save; the API refuses their changes with 403 either way.
export default async function Page({ params }: PageProps<'/app/[weddingId]/settings'>) {
  const { weddingId } = await params;
  const wedding = await getPageWedding(weddingId);
  // The layout handles a missing wedding and a logged-out user.
  if (!wedding || wedding === 'unauthenticated') return null;
  if (wedding.me.role !== 'admin') redirect(`/app/${weddingId}`);
  return <WeddingSettings weddingId={weddingId} />;
}
