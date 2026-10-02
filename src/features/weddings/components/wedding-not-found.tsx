import Link from 'next/link';
import { SimpleHeader } from './simple-header';

/**
 * A wedding that doesn't exist or isn't yours (the same message for both, so other weddings
 * can't be detected). Shown for `/app/{weddingId}` 404s, inside the app rather than the public 404.
 */
export function WeddingNotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <SimpleHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-20 text-center">
        <h1 className="text-3xl">We couldn&apos;t find this wedding</h1>
        <p className="text-text-muted max-w-md">
          The link may be wrong, or you may not have access to this wedding.
        </p>
        <Link href="/app" className="text-primary font-medium hover:underline">
          Go to your weddings
        </Link>
      </main>
    </div>
  );
}
