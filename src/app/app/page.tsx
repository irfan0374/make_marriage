import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppEntry } from '@/features/weddings/components/app-entry';
import { getPageSession } from '@/modules/auth';

export const metadata: Metadata = { title: 'Your weddings' };

export default async function Page() {
  if (!(await getPageSession())) redirect('/login');
  return <AppEntry />;
}
