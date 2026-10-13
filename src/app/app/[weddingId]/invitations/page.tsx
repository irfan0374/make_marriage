import type { Metadata } from 'next';
import { InvitationsPage } from '@/features/invitations/components/invitations-page';
import { getPageWedding } from '@/modules/weddings';

export async function generateMetadata({
  params,
}: PageProps<'/app/[weddingId]/invitations'>): Promise<Metadata> {
  const wedding = await getPageWedding((await params).weddingId);
  // The layout handles the not-found and logged-out cases; this only names the tab.
  if (!wedding || wedding === 'unauthenticated') return {};
  return { title: `Invitations · ${wedding.brideName} & ${wedding.groomName}` };
}

export default async function Page({ params }: PageProps<'/app/[weddingId]/invitations'>) {
  const { weddingId } = await params;
  return <InvitationsPage weddingId={weddingId} />;
}
