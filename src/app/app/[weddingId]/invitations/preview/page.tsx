import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GuestInvitation } from '@/features/invitations/components/guest-invitation';
import { getPageInvitationPreview } from '@/modules/invitations';

// The couple's preview of the guest page (Stitch "Preview what your guests will see"): a sample
// family invited to every event. Replies here are never saved.

export const metadata: Metadata = { title: 'Invitation preview' };

export default async function Page({ params }: PageProps<'/app/[weddingId]/invitations/preview'>) {
  const { weddingId } = await params;
  const invitation = await getPageInvitationPreview(weddingId);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/app/${weddingId}/invitations`}
          className="text-text-muted hover:text-text flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to invitations
        </Link>
        <p className="bg-pending-bg text-pending-text rounded-full px-3 py-1 text-xs font-medium">
          Preview with a sample family · replies aren&apos;t saved
        </p>
      </div>
      <div className="border-border/70 rounded-card mx-auto max-w-xl overflow-hidden border">
        <GuestInvitation invitation={invitation} token={null} />
      </div>
    </div>
  );
}
