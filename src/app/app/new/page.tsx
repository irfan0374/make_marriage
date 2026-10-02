import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CreateWeddingPage } from '@/features/weddings/components/create-wedding-page';
import { getPageOwnWeddingId } from '@/modules/weddings';

export const metadata: Metadata = { title: 'Create your wedding' };

// Each person is an admin of one wedding only (PRD §4): someone who already has theirs is sent
// to it instead of the form.
export default async function Page() {
  const ownWeddingId = await getPageOwnWeddingId();
  if (ownWeddingId === 'unauthenticated') redirect('/login');
  if (ownWeddingId) redirect(`/app/${ownWeddingId}`);
  return <CreateWeddingPage />;
}
