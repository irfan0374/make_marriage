import Link from 'next/link';
import { APP_NAME } from '@/config/app';
import { cn } from '@/shared/cn';

// Text wordmark until the logo SVGs land in public/logo/ (architecture §18.5).
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        'font-heading text-primary inline-flex items-center gap-2 text-lg whitespace-nowrap',
        className,
      )}
    >
      <span aria-hidden className="bg-gold size-1.5 rounded-full" />
      {APP_NAME}
    </Link>
  );
}
