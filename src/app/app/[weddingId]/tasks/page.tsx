import type { Metadata } from 'next';
import { TasksPage } from '@/features/tasks/components/tasks-page';
import { getPageWedding } from '@/modules/weddings';

export async function generateMetadata({
  params,
}: PageProps<'/app/[weddingId]/tasks'>): Promise<Metadata> {
  const wedding = await getPageWedding((await params).weddingId);
  // The layout handles the not-found and logged-out cases; this only names the tab.
  if (!wedding || wedding === 'unauthenticated') return {};
  return { title: `Tasks · ${wedding.brideName} & ${wedding.groomName}` };
}

export default async function Page({ params }: PageProps<'/app/[weddingId]/tasks'>) {
  const { weddingId } = await params;
  return <TasksPage weddingId={weddingId} />;
}
