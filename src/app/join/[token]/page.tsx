import type { Metadata } from 'next';
import { JoinCard } from '@/features/team/components/join-card';
import { getJoinPageState } from '@/modules/team';

// Invite links are private: never indexed, and the token never leaves via the Referer header.
export const metadata: Metadata = {
  title: 'Join a wedding',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params;
  const page = await getJoinPageState(token);
  return <JoinCard token={token} page={page} />;
}
