import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignupPage } from '@/features/auth/components/signup-page';
import { getPageSession } from '@/modules/auth';

export const metadata: Metadata = { title: 'Create your account' };

export default async function Page() {
  if (await getPageSession()) redirect('/app');
  return <SignupPage />;
}
