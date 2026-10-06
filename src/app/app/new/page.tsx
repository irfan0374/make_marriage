import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CreateWeddingPage } from '@/features/weddings/components/create-wedding-page';
import { getPageCanCreateWedding } from '@/modules/weddings';

export const metadata: Metadata = { title: 'Create your wedding' };

// Only someone on no wedding team creates a wedding (PRD §4). The couple who already have one,
// and family members on someone's team, are sent to their weddings instead of the form.
export default async function Page() {
  const canCreate = await getPageCanCreateWedding();
  if (canCreate === 'unauthenticated') redirect('/login');
  if (!canCreate) redirect('/app');
  return <CreateWeddingPage />;
}
