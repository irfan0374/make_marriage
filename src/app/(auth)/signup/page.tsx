import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignupPage } from '@/features/auth/components/signup-page';
import { getPageSession } from '@/modules/auth';
import { emailField } from '@/modules/auth/auth.schemas';
import { safeNextPath } from '@/shared/next-path';

export const metadata: Metadata = { title: 'Create your account' };

// `?next=` brings people back after logging in (e.g. to the invite they were joining), and
// `?email=` fills in the email the invite was sent to. Both are checked before use.
export default async function Page({ searchParams }: PageProps<'/signup'>) {
  const query = await searchParams;
  const next = safeNextPath(query.next);
  if (await getPageSession()) redirect(next ?? '/app');
  const email = emailField.safeParse(query.email);
  return <SignupPage next={next} email={email.success ? email.data : null} />;
}
