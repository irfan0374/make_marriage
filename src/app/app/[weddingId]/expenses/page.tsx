import type { Metadata } from 'next';
import { ExpensesPage } from '@/features/expenses/components/expenses-page';
import { getPageWedding } from '@/modules/weddings';

export async function generateMetadata({
  params,
}: PageProps<'/app/[weddingId]/expenses'>): Promise<Metadata> {
  const wedding = await getPageWedding((await params).weddingId);
  // The layout handles the not-found and logged-out cases; this only names the tab.
  if (!wedding || wedding === 'unauthenticated') return {};
  return { title: `Expenses · ${wedding.brideName} & ${wedding.groomName}` };
}

export default async function Page({ params }: PageProps<'/app/[weddingId]/expenses'>) {
  const { weddingId } = await params;
  return <ExpensesPage weddingId={weddingId} />;
}
