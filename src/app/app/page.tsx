import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHome } from '@/features/auth/components/app-home';
import { getPageSession } from '@/modules/auth';

export const metadata: Metadata = { title: 'Your weddings' };

export default async function Page() {
  const session = await getPageSession();
  if (!session) redirect('/login');
  return <AppHome name={session.user.name} />;
}
