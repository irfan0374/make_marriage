import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginPage } from '@/features/auth/components/login-page';
import { getPageSession } from '@/modules/auth';

export const metadata: Metadata = { title: 'Log in' };

export default async function Page() {
  if (await getPageSession()) redirect('/app');
  return <LoginPage />;
}
