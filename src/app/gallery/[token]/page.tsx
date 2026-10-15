import type { Metadata } from 'next';
import { GalleryUnavailable } from '@/features/gallery/components/guest/gallery-unavailable';
import { GuestGallery } from '@/features/gallery/components/guest/guest-gallery';
import { getGalleryPage } from '@/modules/gallery';

// The guests' photo gallery (architecture §11, PRD §5.10): opened from a QR code or link, no
// login. Never indexed, and the link never leaves through the Referer header.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Photo gallery',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: PageProps<'/gallery/[token]'>) {
  const { token } = await params;
  const gallery = await getGalleryPage(token);
  if (!gallery) return <GalleryUnavailable />;
  return <GuestGallery token={token} initial={gallery} />;
}
