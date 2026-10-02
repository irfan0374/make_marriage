import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CreateWeddingPage } from '@/features/weddings/components/create-wedding-page';
import { getPageSession } from '@/modules/auth';

export const metadata: Metadata = { title: 'Create your wedding' };

export default async function Page() {
  if (!(await getPageSession())) redirect('/login');
  return <CreateWeddingPage />;
}
