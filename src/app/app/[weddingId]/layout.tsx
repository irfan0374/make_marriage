import { notFound, redirect } from 'next/navigation';
import { WeddingSidebar } from '@/features/weddings/components/wedding-nav';
import { WeddingTopBar } from '@/features/weddings/components/wedding-top-bar';
import { getPageWedding } from '@/modules/weddings';

// Inside one wedding: sidebar (desktop), top bar and the page. Checked here, before anything renders, so a
// malformed id, a missing wedding and someone else's wedding all get the same 404.
export default async function Layout({ children, params }: LayoutProps<'/app/[weddingId]'>) {
  const { weddingId } = await params;
  const wedding = await getPageWedding(weddingId);
  if (wedding === 'unauthenticated') redirect('/login');
  if (!wedding) notFound();
  return (
    <div className="flex flex-1">
      <WeddingSidebar weddingId={weddingId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <WeddingTopBar weddingId={weddingId} />
        <main className="mx-auto w-full max-w-310 flex-1 px-5 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
