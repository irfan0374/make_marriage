'use client';

import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { hasOwnWedding, useMe } from '@/features/weddings/hooks';
import { cn } from '@/shared/cn';
import { formatDate } from '@/shared/dates';
import { RoleBadge } from './role-badge';
import { SimpleHeader } from './simple-header';

/**
 * `/app`: no weddings → create one; one wedding → open it; several → pick one.
 * A brand-new couple goes straight from sign-up to creating their wedding.
 */
export function AppEntry() {
  const { data: me, isError, refetch } = useMe();
  const router = useRouter();
  const count = me?.weddings.length;

  useEffect(() => {
    if (count === 0) router.replace('/app/new');
    else if (count === 1) router.replace(`/app/${me!.weddings[0]!.id}`);
  }, [count, me, router]);

  return (
    <div className="flex flex-1 flex-col">
      <SimpleHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 md:py-16">
        {isError ? (
          <div role="alert" className="space-y-3 text-center">
            <p className="text-text-muted">We couldn&apos;t load your weddings.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-primary font-medium hover:underline"
            >
              Try again
            </button>
          </div>
        ) : !me || me.weddings.length < 2 ? (
          <p className="text-text-muted text-center" role="status">
            Loading…
          </p>
        ) : (
          <>
            <h1 className="text-3xl">Your weddings</h1>
            <p className="text-text-muted mt-2 text-sm">Choose a wedding to open.</p>
            <ul className="mt-8 space-y-3">
              {me.weddings.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/app/${w.id}`}
                    className="border-border bg-surface hover:border-primary/30 rounded-card flex items-center gap-4 border p-5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-heading text-xl">
                          {w.brideName} &amp; {w.groomName}
                        </p>
                        <RoleBadge role={w.myRole} />
                        {w.status === 'archived' && (
                          <span className="bg-background-alt text-text-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="text-text-muted mt-1 text-sm">
                        {formatDate(w.weddingDate)} · {w.city}
                      </p>
                    </div>
                    <ChevronRight aria-hidden className="text-text-muted size-5" />
                  </Link>
                </li>
              ))}
            </ul>
            {/* Only for someone without their own wedding, e.g. a Manager in family weddings. */}
            {!hasOwnWedding(me) && (
              <Link
                href="/app/new"
                className={cn(buttonVariants({ variant: 'outline' }), 'mt-6 h-11 px-5')}
              >
                <Plus aria-hidden />
                Create your wedding
              </Link>
            )}
          </>
        )}
      </main>
    </div>
  );
}
