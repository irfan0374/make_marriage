import type { Metadata } from 'next';
import { TeamPage } from '@/features/team/components/team-page';
import { getPageWedding } from '@/modules/weddings';

export async function generateMetadata({
  params,
}: PageProps<'/app/[weddingId]/team'>): Promise<Metadata> {
  const wedding = await getPageWedding((await params).weddingId);
  if (!wedding || wedding === 'unauthenticated') return { title: 'Team' };
  return { title: `Team · ${wedding.brideName} & ${wedding.groomName}` };
}

// Admins manage the team here; Managers see it read-only (the API enforces both).
export default async function Page({ params }: PageProps<'/app/[weddingId]/team'>) {
  const { weddingId } = await params;
  return <TeamPage weddingId={weddingId} />;
}
