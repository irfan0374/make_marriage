import type { Metadata } from 'next';
import { cache } from 'react';
import { GuestInvitation } from '@/features/invitations/components/guest-invitation';
import { InvitationUnavailable } from '@/features/invitations/components/invitation-unavailable';
import { getGuestInvitationPage } from '@/modules/invitations';

// A family's personal invitation (architecture §11). Rendered on the server from the same
// service as the API; never indexed, and the link never leaves through the Referer header.
// "Opened" is recorded by the browser after load, so link-preview bots don't count.

export const dynamic = 'force-dynamic';

// The title and the page share one lookup (and one count against the view limit).
const loadPage = cache(getGuestInvitationPage);

export async function generateMetadata({
  params,
}: PageProps<'/invited/[token]'>): Promise<Metadata> {
  const page = await loadPage((await params).token);
  const base = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
  if (page.kind !== 'ok') return { ...base, title: 'Wedding invitation' };
  const { brideName, groomName } = page.invitation.wedding;
  return { ...base, title: `${brideName} & ${groomName} · Wedding invitation` };
}

export default async function Page({ params }: PageProps<'/invited/[token]'>) {
  const { token } = await params;
  const page = await loadPage(token);
  if (page.kind !== 'ok') return <InvitationUnavailable reason={page.kind} />;
  return <GuestInvitation invitation={page.invitation} token={token} />;
}
