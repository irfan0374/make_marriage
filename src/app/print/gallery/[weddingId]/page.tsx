import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PrintCard } from '@/features/gallery/components/print-card';
import { getPageWedding } from '@/modules/weddings';

// The printable gallery QR card (PRD GAL-1): an A5 card for the tables, printed or saved as a
// PDF from the browser's print dialog. For the wedding's team only; outside the app shell so
// only the card prints.

export const metadata: Metadata = {
  title: 'Gallery QR card',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: PageProps<'/print/gallery/[weddingId]'>) {
  const { weddingId } = await params;
  const wedding = await getPageWedding(weddingId);
  if (wedding === 'unauthenticated') redirect(`/login?next=/print/gallery/${weddingId}`);
  if (!wedding) notFound();
  return (
    <PrintCard
      weddingId={weddingId}
      brideName={wedding.brideName}
      groomName={wedding.groomName}
      weddingDate={wedding.weddingDate}
    />
  );
}
