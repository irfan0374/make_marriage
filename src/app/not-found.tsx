import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-3xl">Page not found</h1>
      <p className="text-muted-foreground max-w-md">
        This page doesn&apos;t exist or the link has changed.
      </p>
      <Link href="/" className="text-primary underline underline-offset-4">
        Go to the home page
      </Link>
    </main>
  );
}
